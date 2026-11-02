//! Read only the document data embedded by skills.sh; never evaluate page scripts.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Metadata {
    pub summary_html: Option<String>,
    pub installation: Option<Installation>,
    pub repository: Option<Link>,
    pub github_stars: Option<String>,
    pub topics: Vec<Link>,
}
impl Metadata {
    pub fn has_data(&self) -> bool {
        self.summary_html
            .as_ref()
            .is_some_and(|value| !value.is_empty())
            || self
                .installation
                .as_ref()
                .is_some_and(|value| value.command.is_some() || value.prompt.is_some())
            || self.repository.is_some()
            || self.github_stars.is_some()
            || !self.topics.is_empty()
    }
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub(super) struct Installation {
    pub command: Option<String>,
    pub prompt: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub(super) struct Link {
    pub label: String,
    pub url: String,
}
pub(super) struct ExtractedPage {
    pub body: Result<String, String>,
    pub metadata: Metadata,
    installations: Vec<String>,
}

pub(super) fn website_source(source: &str) -> bool {
    let Some((name, tld)) = source.rsplit_once('.') else {
        return false;
    };
    !name.is_empty()
        && tld.len() >= 2
        && tld.bytes().all(|c| c.is_ascii_alphabetic())
        && source
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-')
        && name
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        && name
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric)
}
pub(super) fn listing_url(id: &str) -> Result<reqwest::Url, String> {
    let parts: Vec<_> = id.split('/').collect();
    if id.is_empty()
        || id.len() > 600
        || id.chars().any(char::is_control)
        || parts
            .iter()
            .any(|part| part.is_empty() || *part == "." || *part == "..")
    {
        return Err("Invalid skill identity.".into());
    }
    let mut url = reqwest::Url::parse("https://www.skills.sh/").map_err(|e| e.to_string())?;
    let mut path = url.path_segments_mut().map_err(|_| "Invalid skill URL.")?;
    path.clear();
    if parts.len() == 2 && website_source(parts[0]) {
        path.push("site");
    }
    path.extend(parts);
    drop(path);
    Ok(url)
}
fn attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    tag.split_ascii_whitespace().find_map(|part| {
        let value = part.strip_prefix(name)?.strip_prefix('=')?;
        let quote = value.as_bytes().first().copied()?;
        if quote != b'\'' && quote != b'"' {
            return None;
        }
        value[1..].split_once(quote as char).map(|(value, _)| value)
    })
}
pub(super) fn validate_canonical(html: &str, expected: &reqwest::Url) -> Result<(), String> {
    let head = html
        .split_once("</head>")
        .ok_or("Skill page head is missing.")?
        .0;
    for link in head
        .split("<link")
        .skip(1)
        .filter_map(|part| part.split_once('>').map(|(tag, _)| tag))
    {
        if attribute(link, "rel") == Some("canonical") {
            let actual = attribute(link, "href").and_then(|url| reqwest::Url::parse(url).ok());
            return if actual.as_ref() == Some(expected) {
                Ok(())
            } else {
                Err("Skill document belongs to a different listing.".into())
            };
        }
    }
    Err("Skill document identity is missing.".into())
}
fn document_props(value: &serde_json::Value, matches: &mut Vec<(String, String)>) {
    match value {
        serde_json::Value::Object(map) => {
            if let (Some(a), Some(b)) = (
                map.get("previewHtml").and_then(|v| v.as_str()),
                map.get("restHtml").and_then(|v| v.as_str()),
            ) {
                matches.push((a.into(), b.into()));
            }
            if map
                .get("className")
                .and_then(|v| v.as_str())
                .is_some_and(|classes| classes.split_whitespace().any(|class| class == "prose"))
            {
                if let Some(body) = map
                    .get("dangerouslySetInnerHTML")
                    .and_then(|v| v.get("__html"))
                    .and_then(|v| v.as_str())
                {
                    matches.push((body.into(), String::new()));
                }
            }
            for value in map.values() {
                document_props(value, matches);
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                document_props(value, matches);
            }
        }
        _ => {}
    }
}
struct PageData {
    texts: HashMap<String, String>,
    ambiguous: HashSet<String>,
    documents: Vec<(String, String)>,
    records: HashMap<String, Value>,
}
fn page_data(html: &str) -> Result<PageData, String> {
    let mut payload = String::new();
    for script in html.split("<script").skip(1) {
        let Some((_, body)) = script.split_once('>') else {
            continue;
        };
        let Some((body, _)) = body.split_once("</script>") else {
            continue;
        };
        let Some(json) = body.trim().strip_prefix("self.__next_f.push(") else {
            continue;
        };
        if let Some(Ok(value)) = serde_json::Deserializer::from_str(json)
            .into_iter::<serde_json::Value>()
            .next()
        {
            if value[0] == 1 {
                if let Some(text) = value[1].as_str() {
                    payload.push_str(text);
                }
            }
        }
    }
    let mut texts = HashMap::<String, String>::new();
    let mut ambiguous = HashSet::new();
    let mut matches = Vec::new();
    let mut records = HashMap::new();
    let mut rest = payload.as_str();
    while !rest.is_empty() {
        rest = rest.trim_start_matches(['\n', '\r']);
        if rest.is_empty() {
            break;
        }
        let Some(colon) = rest.find(':') else {
            break;
        };
        let id = &rest[..colon];
        if !id.bytes().all(|c| c.is_ascii_hexdigit()) {
            rest = rest.split_once('\n').map_or("", |(_, tail)| tail);
            continue;
        }
        let data = &rest[colon + 1..];
        if let Some(text) = data.strip_prefix('T') {
            let (length, value) = text
                .split_once(',')
                .ok_or("Invalid document text record.")?;
            let count =
                usize::from_str_radix(length, 16).map_err(|_| "Invalid document text length.")?;
            let text = value
                .get(..count)
                .ok_or("Incomplete document text record.")?;
            if let Some(old) = texts.insert(id.into(), text.into()) {
                if old != text {
                    ambiguous.insert(id.to_owned());
                }
            }
            rest = &value[count..];
        } else {
            let (row, tail) = data.split_once('\n').unwrap_or((data, ""));
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(row) {
                document_props(&value, &mut matches);
                records.insert(id.into(), value);
            }
            rest = tail;
        }
    }
    Ok(PageData {
        texts,
        ambiguous,
        documents: matches,
        records,
    })
}
#[cfg(test)]
pub(super) fn parse(html: &str) -> Result<String, String> {
    extract(html)?.body
}

#[derive(Default)]
struct Sections {
    bodies: Vec<String>,
    summaries: Vec<String>,
    repository: Vec<Link>,
    stars: Vec<String>,
    topics: Vec<Link>,
    installation: Vec<Installation>,
}
impl PageData {
    fn resolve<'a>(&'a self, mut value: &'a Value) -> &'a Value {
        let mut seen = HashSet::new();
        while let Some(reference) = value
            .as_str()
            .and_then(|s| s.strip_prefix("$L").or_else(|| s.strip_prefix('$')))
        {
            if !seen.insert(reference) {
                break;
            }
            let Some(next) = self.records.get(reference) else {
                break;
            };
            value = next;
        }
        value
    }
    fn string(&self, value: &Value) -> Option<String> {
        let raw = self.resolve(value).as_str()?;
        if let Some(literal) = raw.strip_prefix("$$") {
            return Some(format!("${literal}"));
        }
        if let Some(id) = raw.strip_prefix('$') {
            return if self.ambiguous.contains(id) {
                None
            } else {
                self.texts.get(id).cloned()
            };
        }
        Some(raw.into())
    }
    fn children<'a>(&'a self, value: &'a Value) -> Vec<&'a Value> {
        let node = self.resolve(value);
        let child = if node[0] == "$" {
            node.get(3).and_then(|v| v.get("children"))
        } else {
            node.get("children")
        };
        match child {
            Some(Value::Array(items)) if items.first() != Some(&Value::String("$".into())) => {
                items.iter().collect()
            }
            Some(value) => vec![value],
            None => Vec::new(),
        }
    }
    fn plain(&self, value: &Value, depth: usize, out: &mut String) {
        if depth > 48 || out.len() > 160 {
            return;
        }
        let node = self.resolve(value);
        if let Some(text) = self.string(node) {
            out.push_str(&text);
        } else {
            for child in self.children(node) {
                self.plain(child, depth + 1, out);
            }
        }
    }
    fn label(&self, value: &Value) -> String {
        let mut text = String::new();
        self.plain(value, 0, &mut text);
        text.split_whitespace().collect::<Vec<_>>().join(" ")
    }
    fn heading_piece(&self, value: &Value, out: &mut String, root: bool, depth: usize) -> bool {
        if depth > 48 {
            return false;
        }
        let node = self.resolve(value);
        if let Some(text) = self.string(node) {
            out.push_str(&text);
            return true;
        }
        let tag = node[1].as_str().unwrap_or_default();
        if tag == "svg" {
            return true;
        }
        if node[0] != "$"
            || !(tag == "span" || root && matches!(tag, "div" | "h2" | "h3" | "h4"))
            || node[3].get("href").is_some()
            || node[3].get("dangerouslySetInnerHTML").is_some()
        {
            return false;
        }
        self.children(node)
            .into_iter()
            .all(|child| self.heading_piece(child, out, false, depth + 1))
    }
    fn heading_label(&self, value: &Value) -> String {
        let mut text = String::new();
        if self.heading_piece(value, &mut text, true, 0) {
            text.split_whitespace().collect::<Vec<_>>().join(" ")
        } else {
            String::new()
        }
    }
    fn html(&self, value: &Value, depth: usize, out: &mut Vec<String>) {
        if depth > 48 {
            return;
        }
        let node = self.resolve(value);
        let props = if node[0] == "$" { &node[3] } else { node };
        if let (Some(a), Some(b)) = (
            props.get("previewHtml").and_then(|v| self.string(v)),
            props.get("restHtml").and_then(|v| self.string(v)),
        ) {
            out.push(a + &b);
            return;
        }
        if props["className"]
            .as_str()
            .is_some_and(|classes| classes.split_whitespace().any(|class| class == "prose"))
        {
            if let Some(body) = props
                .get("dangerouslySetInnerHTML")
                .and_then(|v| v.get("__html"))
                .and_then(|v| self.string(v))
            {
                out.push(body);
                return;
            }
        }
        for child in self.children(node) {
            self.html(child, depth + 1, out);
        }
    }
    fn links(&self, value: &Value, depth: usize, out: &mut Vec<Link>) {
        if depth > 48 {
            return;
        }
        let node = self.resolve(value);
        let props = if node[0] == "$" { &node[3] } else { node };
        if let Some(href) = props["href"].as_str() {
            if let Ok(url) =
                reqwest::Url::parse("https://www.skills.sh/").and_then(|base| base.join(href))
            {
                if matches!(url.scheme(), "https" | "http")
                    && url.username().is_empty()
                    && url.password().is_none()
                {
                    let label = self.label(node);
                    if !label.is_empty() {
                        out.push(Link {
                            label,
                            url: url.to_string(),
                        });
                    }
                }
            }
        }
        for child in self.children(node) {
            self.links(child, depth + 1, out);
        }
    }
    // Scan the serialized nodes once; resolve references only within the named section.
    // Footer Topics and similarly styled Summary prose must never become skill metadata/body.
    fn scan(&self, value: &Value, sections: &mut Sections) {
        let props = if value[0] == "$" { &value[3] } else { value };
        if value.is_object() && props["label"] == "Installation" {
            let command = props.get("command").and_then(|v| self.string(v));
            let prompt = props.get("prompt").and_then(|v| self.string(v));
            if command.is_some() || prompt.is_some() {
                sections.installation.push(Installation { command, prompt });
            }
        }
        // Flight also uses unwrapped sibling groups, not only element children.
        // Scan each serialized group once; an element tuple is not a sibling group.
        if let Value::Array(children) = value {
            if value[0] != "$" {
                for pair in children.windows(2) {
                    match self.heading_label(&pair[0]).as_str() {
                        "SKILL.md" => self.html(&pair[1], 0, &mut sections.bodies),
                        "Summary" => self.html(&pair[1], 0, &mut sections.summaries),
                        "Repository" => self.links(&pair[1], 0, &mut sections.repository),
                        "GitHub Stars" => {
                            let stars = self.label(&pair[1]);
                            if !stars.is_empty() && stars.len() <= 32 {
                                sections.stars.push(stars);
                            }
                        }
                        _ => {}
                    }
                    if self.resolve(&pair[0])[1] == "h1" {
                        let mut topics = Vec::new();
                        self.links(&pair[1], 0, &mut topics);
                        sections.topics.extend(topics.into_iter().filter(|link| {
                            reqwest::Url::parse(&link.url).is_ok_and(|url| {
                                url.host_str() == Some("www.skills.sh")
                                    && url.path().starts_with("/topic/")
                            })
                        }));
                    }
                }
            }
        }
        match value {
            Value::Array(items) => {
                for item in items {
                    self.scan(item, sections);
                }
            }
            Value::Object(map) => {
                for item in map.values() {
                    self.scan(item, sections);
                }
            }
            _ => {}
        }
    }
}
fn unique<T>(mut values: Vec<T>) -> Option<T> {
    if values.len() == 1 {
        values.pop()
    } else {
        None
    }
}
pub(super) fn extract(html: &str) -> Result<ExtractedPage, String> {
    let data = page_data(html)?;
    let mut sections = Sections::default();
    for value in data.records.values() {
        data.scan(value, &mut sections);
    }
    let mut bodies = sections.bodies;
    let mut reference_error = None;
    if bodies.is_empty() {
        for (a, b) in &data.documents {
            let a = data.string(&Value::String(a.clone()));
            let b = data.string(&Value::String(b.clone()));
            if a.is_none() || b.is_none() {
                reference_error = Some(
                    if data.ambiguous.is_empty() {
                        "Document text reference is missing."
                    } else {
                        "Ambiguous document text reference."
                    }
                    .to_owned(),
                );
            }
            if let (Some(a), Some(b)) = (a, b) {
                let body = a + &b;
                if !sections.summaries.contains(&body) {
                    bodies.push(body);
                }
            }
        }
    }
    let body = unique(bodies)
        .ok_or_else(|| {
            reference_error.unwrap_or_else(|| {
                "Complete skill document is unavailable in this response.".to_owned()
            })
        })
        .and_then(|body| {
            if body.trim().is_empty() {
                Err("Skill document is empty.".into())
            } else if body.len() > 256 * 1024 {
                Err("Skill document exceeds the preview size limit.".into())
            } else {
                Ok(body)
            }
        });
    let installations = sections
        .installation
        .iter()
        .filter_map(|entry| entry.command.clone())
        .collect();
    let metadata = Metadata {
        summary_html: unique(sections.summaries),
        installation: unique(sections.installation),
        repository: unique(sections.repository),
        github_stars: unique(sections.stars),
        topics: sections.topics,
    };
    Ok(ExtractedPage {
        body,
        metadata,
        installations,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn script(payload: &str) -> String {
        let packet = json!([1, payload]).to_string().replace('<', "\\u003c");
        format!("<script>self.__next_f.push({packet})</script>")
    }
    fn props(preview: &str, rest: &str) -> String {
        format!(
            "0:{}\n",
            json!(["$", "component", null, {"previewHtml":preview,"restHtml":rest}])
        )
    }
    fn node(tag: &str, children: Value) -> Value {
        json!(["$",tag,null,{"children":children}])
    }
    fn prose(body: &str) -> Value {
        json!(["$","div",null,{"className":"prose prose-sm","dangerouslySetInnerHTML":{"__html":body}}])
    }
    fn semantic_page(collapsed: bool, command_ref: bool) -> String {
        let summary = prose("<p>Independent summary</p><ul><li>Summary point</li></ul>");
        let body = if collapsed {
            json!(["$","component",null,{"previewHtml":"$b","restHtml":"$c"}])
        } else {
            prose("$b")
        };
        let installation = json!({"label":"Installation","command":if command_ref {"$d"} else {"npx skills add https://example.org/skills/chosen"},"prompt":"$e"});
        let title = node(
            "div",
            json!([
                node("h1", json!("Chosen skill")),
                node(
                    "div",
                    json!([
                        json!(["$","a",null,{"href":"/topic/development","children":"Development"}])
                    ])
                )
            ]),
        );
        let tree = node(
            "main",
            json!([
                title,
                node("section", json!([node("h2", json!("Summary")), "$L1"])),
                node("section", json!([node("h2", json!("SKILL.md")), body])),
                node(
                    "section",
                    json!([
                        node("h2", json!("Repository")),
                        node(
                            "div",
                            json!([
                                json!(["$","a",null,{"href":"https://github.com/owner/repo","children":"owner/repo"}])
                            ])
                        )
                    ])
                ),
                node(
                    "section",
                    json!([
                        node("h2", json!("GitHub Stars")),
                        node("span", json!("37.5K"))
                    ])
                ),
                installation,
                node(
                    "footer",
                    json!([
                        node("h2", json!("Topics")),
                        json!(["$","a",null,{"href":"/topic/unrelated","children":"Footer topic"}])
                    ])
                )
            ]),
        );
        let text = |id: &str, value: &str| format!("{id}:T{:x},{value}", value.len());
        script(
            &(format!("0:{tree}\n1:{summary}\n")
                + &text("b", "<h1>真实技能</h1><p>Original body</p>")
                + &text("c", "<p>Complete ending</p>")
                + &text("d", "npx skills add https://example.org/skills/chosen")
                + &text(
                    "e",
                    "Install the skill \"chosen\".\nKeep all original bytes.",
                )),
        )
    }
    #[test]
    fn semantic_summary_and_document_stay_separate_with_short_or_collapsed_bodies_and_references() {
        for collapsed in [false, true] {
            let page = extract(&semantic_page(collapsed, false)).unwrap();
            let body = page.body.unwrap();
            assert!(body.contains("Original body"));
            assert!(!body.contains("Independent summary"));
            assert_eq!(body.contains("Complete ending"), collapsed);
            let meta = page.metadata;
            assert!(meta.summary_html.unwrap().contains("Summary point"));
            assert_eq!(meta.github_stars.as_deref(), Some("37.5K"));
            assert_eq!(
                meta.repository.unwrap(),
                Link {
                    label: "owner/repo".into(),
                    url: "https://github.com/owner/repo".into()
                }
            );
            assert_eq!(
                meta.topics,
                vec![Link {
                    label: "Development".into(),
                    url: "https://www.skills.sh/topic/development".into()
                }]
            );
            let install = meta.installation.unwrap();
            assert_eq!(
                install.command.as_deref(),
                Some("npx skills add https://example.org/skills/chosen")
            );
            assert_eq!(
                install.prompt.as_deref(),
                Some("Install the skill \"chosen\".\nKeep all original bytes.")
            );
        }
    }
    #[test]
    fn semantic_fields_in_plain_flight_child_groups_preserve_body_summary_repository_and_stars() {
        fn unwrap_sections(value: &mut Value) {
            if value[0] == "$" && value[1] == "section" {
                *value = value[3]["children"].clone();
            }
            match value {
                Value::Array(items) => {
                    for item in items {
                        unwrap_sections(item)
                    }
                }
                Value::Object(map) => {
                    for item in map.values_mut() {
                        unwrap_sections(item)
                    }
                }
                _ => {}
            }
        }
        for collapsed in [false, true] {
            let mut data = page_data(&semantic_page(collapsed, false)).unwrap();
            let mut payload = String::new();
            for (id, value) in &mut data.records {
                unwrap_sections(value);
                payload += &format!("{id}:{value}\n");
            }
            for (id, text) in data.texts {
                payload += &format!("{id}:T{:x},{text}", text.len());
            }
            let page = extract(&script(&payload)).unwrap();
            assert!(page.body.unwrap().contains("Original body"));
            assert!(page
                .metadata
                .summary_html
                .unwrap()
                .contains("Summary point"));
            assert_eq!(page.metadata.github_stars.as_deref(), Some("37.5K"));
            assert!(page.metadata.repository.is_some());
            assert_eq!(page.metadata.topics.len(), 1);
        }
    }

    #[test]
    fn resolved_installation_command_has_same_identity_as_the_displayed_metadata() {
        let page = extract(&semantic_page(true, true)).unwrap();
        assert_eq!(
            page.metadata
                .installation
                .as_ref()
                .unwrap()
                .command
                .as_deref(),
            Some("npx skills add https://example.org/skills/chosen")
        );
        assert_eq!(
            page.installation_source("example.org").unwrap(),
            "https://example.org/skills/chosen"
        );
    }
    #[test]
    #[ignore = "Uses explicitly saved public page samples; no network, Git, or installation"]
    fn saved_public_pages_preserve_real_semantic_metadata_and_complete_bodies() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join(".scratch/store-detail-page-samples");
        for (name, id) in [
            ("find-skills", "vercel-labs/skills/find-skills"),
            ("frontend-design", "anthropics/skills/frontend-design"),
            ("lark-note", "open.feishu.cn/lark-note"),
        ] {
            let raw = std::fs::read_to_string(root.join(format!("{name}.html"))).unwrap();
            validate_canonical(&raw, &listing_url(id).unwrap()).unwrap();
            let page = extract(&raw).unwrap();
            let body = page.body.unwrap_or_else(|reason| {
                let data = page_data(&raw).unwrap();
                let mut sections = Sections::default();
                for value in data.records.values() {
                    data.scan(value, &mut sections);
                }
                panic!(
                    "{name}: {reason}; body lengths={:?}; summary lengths={:?}",
                    sections.bodies.iter().map(String::len).collect::<Vec<_>>(),
                    sections
                        .summaries
                        .iter()
                        .map(String::len)
                        .collect::<Vec<_>>()
                );
            });
            assert!(!body.trim().is_empty(), "{name}");
            let meta = page.metadata;
            if name == "lark-note" {
                assert!(meta.summary_html.is_none());
                assert!(meta.repository.is_none());
                assert!(meta.github_stars.is_none());
                assert!(meta.topics.is_empty());
            } else {
                assert!(body.len() > 1000, "{name}");
                assert!(
                    meta.summary_html
                        .as_ref()
                        .is_some_and(|value| !value.is_empty()),
                    "{name}: summary"
                );
            }
            let install = meta.installation.as_ref().expect("installation");
            assert!(install
                .command
                .as_ref()
                .is_some_and(|value| !value.is_empty()));
            assert!(install
                .prompt
                .as_ref()
                .is_some_and(|value| !value.is_empty()));
            if name != "lark-note" {
                assert!(meta.repository.is_some(), "{name}: repo");
                assert!(meta.github_stars.is_some(), "{name}: stars");
                assert!(!meta.topics.is_empty(), "{name}: topics");
            }
            println!(
                "{name}: body={} summary={} command={} prompt={} stars={:?} topics={:?}",
                body.len(),
                meta.summary_html.as_ref().map_or(0, String::len),
                install.command.as_ref().unwrap().len(),
                install.prompt.as_ref().unwrap().len(),
                meta.github_stars,
                meta.topics
            );
        }
    }

    #[test]
    fn short_prose_and_full_installation_source_keep_website_identity() {
        let command = "npx skills add 'https://uizze.sh/skills/ui-taste'";
        let packet = format!(
            "0:{}\n",
            json!({"className":"prose dark:prose-invert","dangerouslySetInnerHTML":{"__html":"<h2>标题</h2><p>完整简介</p>"},"children":{"label":"Installation","command":command}})
        );
        let html = script(&packet);
        assert_eq!(parse(&html).unwrap(), "<h2>标题</h2><p>完整简介</p>");
        assert_eq!(
            installation_source(&html, "uizze.sh").unwrap(),
            "https://uizze.sh/skills/ui-taste"
        );
        for source in [
            "https://other.sh/skills/ui-taste",
            "https://uizze.sh.evil.test/path",
            "https://user@uizze.sh/path",
            "https://uizze.sh/path?flag=1",
            "https://uizze.sh/path#part",
            "https://uizze.sh:444/path",
            "file:///tmp/skill",
            "https://uizze.sh/path --yes",
        ] {
            assert!(
                validate_installation_source(source, "uizze.sh").is_err(),
                "{source}"
            );
        }
        assert_eq!(
            validate_installation_source("https://uizze.sh:443/path", "uizze.sh").unwrap(),
            "https://uizze.sh/path"
        );
        assert_eq!(
            validate_installation_source("http://uizze.sh:80/path", "uizze.sh").unwrap(),
            "http://uizze.sh/path"
        );
        assert!(installation_source(&script(&props("<p>Body</p>", "")), "uizze.sh").is_err());
        let ambiguous = format!(
            "0:{}\n",
            json!([{"label":"Installation","command":command},{"label":"Installation","command":command}])
        );
        assert!(installation_source(&script(&ambiguous), "uizze.sh").is_err());
    }

    #[test]
    fn download_snapshot_uses_unique_root_skill_and_preserves_exact_bytes() {
        let content = "---\r\nname: sample\r\n---\r\n# 原文\n";
        let raw = serde_json::json!({"files":[{"path":"nested/SKILL.md","contents":"wrong"},{"path":"SKILL.md","contents":content},{"path":"notes.txt","contents":"ignored"}]}).to_string();
        assert_eq!(snapshot_markdown(&raw).unwrap(), content);
        for files in [
            serde_json::json!([]),
            serde_json::json!([{"path":"sub/SKILL.md","contents":"nested"}]),
            serde_json::json!([{"path":"SKILL.md","contents":"one"},{"path":"skill.md","contents":"two"}]),
            serde_json::json!([{"path":"SKILL.md","contents":" "}]),
            serde_json::json!([{"path":"SKILL.md","contents":5}]),
            serde_json::json!([{"path":"SKILL.md","contents":"x".repeat(256*1024+1)}]),
        ] {
            assert!(snapshot_markdown(&serde_json::json!({"files":files}).to_string()).is_err());
        }
        assert!(snapshot_markdown("not json").is_err());
    }
    #[test]
    fn download_snapshot_identity_keeps_encoded_segments_and_rejects_invalid_repository_routes() {
        let url = snapshot_url("owner/repo/skill name?#").unwrap();
        assert_eq!(
            url.as_str(),
            "https://skills.sh/api/download/owner/repo/skill%20name%3F%23"
        );
        for id in [
            "domain.test/skill",
            "owner/repo/..",
            "owner/repo/.",
            "owner/repo/skill/extra",
            "owner/repo/",
            "bad owner/repo/skill",
            "owner/repo/line\n",
        ] {
            assert!(snapshot_url(id).is_err(), "{id}");
        }
    }

    #[test]
    fn inline_preview_and_remainder_form_one_complete_document() {
        let preview = "<h1>Guide</h1><p>Visible introduction.</p>";
        let rest = "<h2>Complete ending</h2><p>Last paragraph.</p>";
        assert_eq!(
            parse(&script(&props(preview, rest))).unwrap(),
            format!("{preview}{rest}")
        );
        assert_eq!(
            parse(&script(&props("$$literal", "<p>End</p>"))).unwrap(),
            "$literal<p>End</p>"
        );
    }
    #[test]
    fn utf8_byte_references_survive_outer_flight_chunks_and_do_not_parse_text_as_records() {
        let preview = "<h1>中文 🌈</h1><p>简介</p>";
        let rest =
            "<pre>\n9:{\"previewHtml\":\"INJECTED\",\"restHtml\":\"BAD\"}\n</pre><p>全文末尾</p>";
        let payload = format!(
            "{}a:T{:x},{preview}b:T{:x},{rest}",
            props("$a", "$b"),
            preview.len(),
            rest.len()
        );
        let chars: Vec<char> = payload.chars().collect();
        let html = chars
            .chunks(13)
            .map(|part| script(&part.iter().collect::<String>()))
            .collect::<String>();
        assert_eq!(parse(&html).unwrap(), format!("{preview}{rest}"));
    }
    #[test]
    fn missing_ambiguous_and_invalid_byte_references_are_errors_not_partial_documents() {
        assert!(parse(&script(&props("<p>Partial</p>", "$missing"))).is_err());
        let duplicate = format!("{}a:T1,xa:T1,y", props("$a", "end"));
        assert!(parse(&script(&duplicate))
            .unwrap_err()
            .contains("Ambiguous"));
        for record in [
            "a:T4,<p>你</p>",
            "a:Tffff,x",
            "a:Tgg,x",
            "a:Tffffffffffffffffffffffffffff,x",
        ] {
            assert!(parse(&script(&format!("{}{record}", props("$a", "end")))).is_err());
        }
        assert!(parse(&script(&props(" ", "\n"))).is_err());
        assert!(parse(&script(&props(&"x".repeat(256 * 1024), "y"))).is_err());
        assert!(parse(&script(&(props("one", "end") + &props("other", "end")))).is_err());
    }
    #[test]
    fn unrelated_scripts_jsonld_and_text_strings_are_never_executed_as_flight_data() {
        let valid = script(&props("<p>Actual</p>", "<p>End</p>"));
        let html=format!("<script>throw new Error('must not execute')</script><script>window.fake=\"self.__next_f.push([1,invalid])\";</script><script type=\"application/ld+json\">{}</script>{valid}",json!({"previewHtml":"FAKE","restHtml":"BAD"}));
        assert_eq!(parse(&html).unwrap(), "<p>Actual</p><p>End</p>");
        assert!(parse("<script>window.fake='self.__next_f.push([1,invalid])';</script>").is_err());
    }
    #[test]
    fn canonical_identity_is_checked_in_the_page_head_not_in_document_content() {
        let url = listing_url("owner/repo/skill").unwrap();
        let expected = url.as_str();
        assert!(validate_canonical(
            &format!("<head><link nonce=\"public\" rel='canonical' href='{expected}'/></head>"),
            &url
        )
        .is_ok());
        for html in [format!("<head></head><body><link rel=\"canonical\" href=\"{expected}\"></body>"),format!("<head><link rel=\"canonical\" href=\"https://www.skills.sh/other/repo/skill\"></head><body><link rel=\"canonical\" href=\"{expected}\"></body>"),"<head><link rel=\"canonical\" href=\"https://evil.test/owner/repo/skill\"></head>".into(),"<html>Missing head</html>".into()] {
            assert!(validate_canonical(&html,&url).is_err());
        }
    }
    #[test]
    fn repository_and_website_listing_routes_keep_source_identity() {
        assert_eq!(
            listing_url("owner/repo/skill").unwrap().as_str(),
            "https://www.skills.sh/owner/repo/skill"
        );
        assert_eq!(
            listing_url("uizze.sh/ui-taste").unwrap().as_str(),
            "https://www.skills.sh/site/uizze.sh/ui-taste"
        );
        assert_eq!(
            listing_url("sub.example.com/skill").unwrap().as_str(),
            "https://www.skills.sh/site/sub.example.com/skill"
        );
        assert!(!website_source("owner/repo"));
        assert!(!website_source("-bad.com"));
        assert!(!website_source("localhost"));
        let url = listing_url("owner/repo/skill?x#y").unwrap();
        assert!(url.query().is_none());
        assert!(url.fragment().is_none());
        for id in [
            "",
            "../skill",
            "owner//skill",
            "owner/./skill",
            "owner/repo/line\nbreak",
        ] {
            assert!(listing_url(id).is_err());
        }
    }
    #[test]
    #[ignore = "Requires public HTTPS; reads three public pages only, no Git or installation"]
    fn live_full_document_contract_for_repository_and_website_listings() {
        for id in [
            "vercel-labs/skills/find-skills",
            "anthropics/skills/frontend-design",
            "uizze.sh/ui-taste",
        ] {
            let url = listing_url(id).unwrap();
            let raw = crate::marketplace::response(url.clone()).unwrap();
            validate_canonical(&raw, &url).unwrap();
            let body = parse(&raw).unwrap();
            assert!(body.len() > 1000);
            println!("{id}: {} complete HTML bytes", body.len());
        }
    }
}

pub(super) fn snapshot_url(id: &str) -> Result<reqwest::Url, String> {
    let parts: Vec<_> = id.split('/').collect();
    if parts.len() != 3
        || !parts[..2].iter().all(|part| super::token(part))
        || parts[2].is_empty()
        || parts[2].len() > 200
        || parts[2] == "."
        || parts[2] == ".."
        || parts[2].chars().any(char::is_control)
    {
        return Err("Invalid snapshot identity.".into());
    }
    let mut url =
        reqwest::Url::parse("https://skills.sh/api/download/").map_err(|e| e.to_string())?;
    url.path_segments_mut()
        .map_err(|_| "Invalid snapshot URL.")?
        .pop_if_empty()
        .extend(parts);
    Ok(url)
}
pub(super) fn snapshot_markdown(raw: &str) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let files = value["files"]
        .as_array()
        .ok_or("Skill snapshot is unavailable.")?;
    let matches: Vec<_> = files
        .iter()
        .filter(|file| {
            file["path"]
                .as_str()
                .is_some_and(|path| path.eq_ignore_ascii_case("SKILL.md"))
        })
        .collect();
    if matches.len() != 1 {
        return Err("Snapshot does not contain a unique SKILL.md.".into());
    }
    let content = matches[0]["contents"]
        .as_str()
        .ok_or("Snapshot SKILL.md is missing.")?;
    if content.trim().is_empty() || content.len() > 256 * 1024 {
        return Err("Snapshot SKILL.md is empty or exceeds the size limit.".into());
    }
    Ok(content.to_owned())
}

#[cfg(test)]
pub(super) fn installation_source(html: &str, expected_host: &str) -> Result<String, String> {
    extract(html)?.installation_source(expected_host)
}
impl ExtractedPage {
    pub(super) fn installation_source(&self, expected_host: &str) -> Result<String, String> {
        let commands = &self.installations;
        if commands.len() != 1 {
            return Err("Published installation source is missing or ambiguous.".into());
        }
        let source = commands[0]
            .strip_prefix("npx skills add ")
            .ok_or("Unsupported published installation source.")?
            .trim();
        let source = source
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
            .or_else(|| {
                source
                    .strip_prefix('\'')
                    .and_then(|value| value.strip_suffix('\''))
            })
            .unwrap_or(source);
        validate_installation_source(source, expected_host)
    }
}
pub(super) fn validate_installation_source(
    source: &str,
    expected_host: &str,
) -> Result<String, String> {
    let url = reqwest::Url::parse(source).map_err(|_| "Invalid published installation URL.")?;
    if !matches!(url.scheme(), "https" | "http")
        || !url
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case(expected_host))
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || source.chars().any(char::is_whitespace)
    {
        return Err("Published installation source does not match the website.".into());
    }
    Ok(url.to_string())
}
