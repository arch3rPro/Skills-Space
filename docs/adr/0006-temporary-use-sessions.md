# ADR 0006: Original use with owned temporary sessions

- Status: Implemented technical decision under spec 0003; acceptance evidence belongs in plan 0004
- Date: 2026-10-13
- Related: [ADR 0005](0005-use-unmodified-upstream-cli.md)

The pinned original `use` command either prints a prompt or launches one supported Agent with inherited terminal I/O. It removes cloned repositories but retains materialized support files, including after ordinary exit. It does not export a session-state API. Skills Space needs to preserve real interaction, explain process results and let users release those files deliberately.

The application executes the unchanged CLI inside a private application-cache session. The original CLI owns fetching, selection, temporary materialization, prompt construction and Agent invocation. Rust owns source/working-directory confirmation, executable inspection, session identifiers, terminal launch, observation and release. A bundled Node orchestration script supplies an owned TMPDIR, records process state and monitors explicit cancellation. It neither installs skills nor rewrites source/installation locks.

For interactive use on macOS, the system Terminal provides the actual TTY. A session-local command bridge verifies the original materialized files and original prompt contract before delegating to the user's absolute Agent executable with the unchanged prompt argument. Its PATH scope is limited to that invocation; no user-installed command is replaced. This verification also prevents an unchecked source race from launching the real Agent. The application does not implement a second Agent CLI, prompt template or terminal emulator. No runtime dependency is added.

Session state is private structured process metadata, not parsed terminal prose or a claim that an Agent completed the user's task. Normal exit preserves surviving process-group jobs and keeps their support files; explicit Stop ends that owned process group. Preparation has a timeout; a launched interactive Agent does not have a fixed session duration. User-initiated release removes only the validated session root after owned processes have ended, with a filesystem ownership claim preventing a delayed terminal startup from racing release. The application never scans and removes arbitrary system skills-use directories.

Prompt copies retain real support paths; their GUI preview abbreviates HOME. Closing the dialog retains sessions, and reopening reads cache records. A crashed runner or an unconfirmed process group remains review-required and is not killed by guessed PID. Process groups do not provide containment for a daemon that deliberately detaches itself; ordinary Agent permissions and the user's terminal permission prompts remain in effect. Temporary files and prompt/source records are protected by private cache-directory permissions. Credentials are not copied into session configuration.

This implementation enables verified Unix prompt sessions and macOS system-terminal launch. Windows process-control integration and Linux terminal launch remain unavailable; platform acceptance and real authenticated Agent runs require their own evidence. Deterministic Agent fixtures and a real PTY validate orchestration without consuming a user's authenticated Agent session.
