//! Test-only anonymous smart-HTTP Git origin. Never uses a real account.
use super::*;
use std::io::{Read, Write};
pub(crate) struct GitOrigin {
    pub url: String,
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl GitOrigin {
    pub fn new(repository: &Path) -> Self {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let root = repository.to_path_buf();
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let quit = stop.clone();
        let thread = std::thread::spawn(move || {
            while !quit.load(std::sync::atomic::Ordering::Relaxed) {
                let Ok((mut stream, _)) = listener.accept() else {
                    std::thread::sleep(Duration::from_millis(10));
                    continue;
                };
                stream
                    .set_read_timeout(Some(Duration::from_secs(10)))
                    .unwrap();
                let mut headers = Vec::new();
                while !headers.ends_with(b"\r\n\r\n") {
                    let mut byte = [0];
                    if stream.read_exact(&mut byte).is_err() {
                        break;
                    }
                    headers.push(byte[0]);
                }
                // Clients may connect and close before sending a request.
                // An incomplete connection must not terminate the test origin.
                if !headers.ends_with(b"\r\n\r\n") {
                    continue;
                }
                let headers = String::from_utf8(headers).unwrap();
                let mut first = headers.lines().next().unwrap().split_whitespace();
                let method = first.next().unwrap();
                let path = first.next().unwrap();
                let (path, query) = path.split_once('?').unwrap_or((path, ""));
                let size = headers
                    .lines()
                    .find_map(|l| {
                        l.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|v| v.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                let mut body = vec![0; size];
                stream.read_exact(&mut body).unwrap();
                let mut child = Command::new("git")
                    .args(["http-backend"])
                    .env("GIT_PROJECT_ROOT", root.parent().unwrap())
                    .env("GIT_HTTP_EXPORT_ALL", "1")
                    .env("PATH_INFO", path)
                    .env("QUERY_STRING", query)
                    .env("REQUEST_METHOD", method)
                    .env("CONTENT_TYPE", "application/x-git-upload-pack-request")
                    .env("CONTENT_LENGTH", size.to_string())
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .spawn()
                    .unwrap();
                child.stdin.take().unwrap().write_all(&body).unwrap();
                let output = child.wait_with_output().unwrap().stdout;
                let split = output.windows(4).position(|v| v == b"\r\n\r\n").unwrap();
                let (head, body) = output.split_at(split + 4);
                let response = format!(
                    "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: {}\r\n",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.write_all(head);
                let _ = stream.write_all(body);
            }
        });
        Self {
            url: format!(
                "http://{address}/{}",
                repository.file_name().unwrap().to_string_lossy()
            ),
            stop,
            thread: Some(thread),
        }
    }
}
impl Drop for GitOrigin {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            thread.join().unwrap();
        }
    }
}
