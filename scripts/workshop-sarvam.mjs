// Sarvam Code's original app-server protocol, as used by its official VS Code extension.
// One thread and turn belong to this process; no account, model or CLI configuration is written.
export function sarvamTurn({ session, cwd, planning, instruction, write, end, onEvent, onError, kill }) {
  let threadId = session, turnId, interruptSent = false, finished = false, exitTimer;
  const send = (id, method, params) => write({ id, method, params });
  function finish() {
    finished = true;
    end();
    clearTimeout(exitTimer);
    exitTimer = setTimeout(kill, 2000);
  }
  function fail(message) { onError(message); finish(); }
  return {
    start() { send(0, 'initialize', { clientInfo: { name: 'skills-space', title: 'Skills Space', version: '0.1.0' }, capabilities: { experimentalApi: true } }); },
    receive(message) {
      if (message.id !== undefined && !message.method) {
        if (message.error) { fail(message.error.message || 'Sarvam Code request failed.'); return; }
        if (message.id === 0) {
          send(1, session ? 'thread/resume' : 'thread/start', { ...(session ? { threadId: session } : {}), cwd, sandbox: planning ? 'read-only' : 'workspace-write', approvalPolicy: 'never' });
        } else if (message.id === 1) {
          threadId = message.result?.thread?.id;
          if (typeof threadId !== 'string' || !threadId) { fail('Sarvam Code did not return a thread identity.'); return; }
          onEvent({ session: threadId });
          send(2, 'turn/start', { threadId, input: [{ type: 'text', text: instruction }] });
        } else if (message.id === 2) { turnId = message.result?.turn?.id || turnId; }
        return;
      }
      if (message.id !== undefined && message.method) {
        const approvals = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', 'applyPatchApproval', 'execCommandApproval'];
        write(approvals.includes(message.method) ? { id: message.id, result: { decision: 'decline' } } : { id: message.id, error: { code: -32601, message: 'This workbench does not answer interactive tool requests.' } });
        fail(`Sarvam Code requires an interactive response for ${message.method}. Continue this interaction in the original CLI.`);
        return;
      }
      const event = message.params || {};
      if (event.threadId && event.threadId !== threadId) return;
      if (event.turnId && turnId && event.turnId !== turnId) return;
      switch (message.method) {
        case 'turn/started': turnId = event.turn?.id; break;
        case 'item/agentMessage/delta': onEvent({ delta: event.delta || '' }); break;
        case 'item/started': onEvent({ activity: event.item?.type === 'commandExecution' ? event.item.command || '' : event.item?.type === 'fileChange' ? 'Updating files' : '' }); break;
        case 'item/completed':
          if (event.item?.type === 'agentMessage' && typeof event.item.text === 'string') onEvent({ text: event.item.text, final: true });
          else onEvent({ activity: '' });
          break;
        case 'turn/completed':
          if (event.turn?.id && turnId && event.turn.id !== turnId) return;
          if (event.turn?.status === 'completed' || interruptSent && event.turn?.status === 'interrupted') { onEvent({ done: true }); finish(); }
          else fail(event.turn?.error?.message || `Sarvam Code turn ended with ${event.turn?.status || 'no completion status'}.`);
          break;
        case 'error': if (!event.willRetry) fail(event.error?.message || 'Sarvam Code failed.'); break;
      }
    },
    stop() {
      if (finished || !threadId || !turnId) return false;
      if (!interruptSent) {
        interruptSent = true;
        send(3, 'turn/interrupt', { threadId, turnId });
        exitTimer = setTimeout(kill, 2000);
      }
      return true;
    },
    close() { clearTimeout(exitTimer); }
  };
}
