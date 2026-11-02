// Terminal formatting is diagnostic presentation, never installation state.
export function formatExecutionLog(value: string): string {
  const plain = value
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    .replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[()][0-2A-Z]/g, "")
    .replace(/\u001b[@-_]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0007\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "");
  return plain.split("\n").filter(line => !/^[ █╔╗╚╝═║]+$/.test(line)).map(line => {
    const updates = line.split("\r").filter(Boolean);
    const current = updates[updates.length - 1] ?? "";
    if (!current.includes("\b")) return current;
    const characters: string[] = [];
    for (const character of current) {
      if (character === "\b") characters.pop(); else characters.push(character);
    }
    return characters.join("");
  }).join("\n");
}
