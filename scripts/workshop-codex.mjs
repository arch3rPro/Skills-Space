// Original Codex App Server for workshop authoring. The workbench owns plan approval.
export function codexTurn({session,cwd,planning,instruction,write,end,onEvent,onQuestion,onResolved}) {
  let threadId, turnId, pending, submitted, interrupted=false, finished=false, plan;
  const send=(id,method,params)=>write({jsonrpc:'2.0',id,method,params});
  const fail=message=>{finished=true;onEvent({error:message});end();};
  return {
    start(){
      send(1,'initialize',{clientInfo:{name:'skills_space',version:'0.1.0'},capabilities:{experimentalApi:true}});
    },
    receive(message){
      if(finished)return;
      if(message.error&&!message.method){fail(message.error.message);return;}
      const event=message.params??{};
      if(message.id===1&&!message.method){
        write({jsonrpc:'2.0',method:'initialized'});
        send(2,session?'thread/resume':'thread/start',{...(session?{threadId:session}:{}),cwd,sandbox:planning?'read-only':'workspace-write',approvalPolicy:'never'});
      }else if(message.id===2&&!message.method){
        threadId=message.result.thread.id;
        onEvent({session:threadId});
        send(3,'turn/start',{threadId,input:[{type:'text',text:instruction}],collaborationMode:{mode:planning?'plan':'default',settings:{model:message.result.model,reasoning_effort:null,developer_instructions:null}}});
      }else if(message.method==='turn/started'){
        turnId=event.turn.id;
      }else if(message.id===3&&!message.method){
        turnId=message.result.turn.id;
      }else if(message.method==='item/tool/requestUserInput'&&event.threadId===threadId&&event.turnId===turnId&&pending===undefined&&event.questions?.length&&planning){
        if(event.questions.some(question=>question.isSecret)){fail('Codex requested a secret. Enter it in the original Codex client.');return;}
        pending=message.id;
        onQuestion(event.questions);
      }else if(message.method==='serverRequest/resolved'&&event.threadId===threadId&&event.requestId===pending){
        const answers=submitted;
        pending=undefined;submitted=undefined;
        onResolved(answers);
      }else if(message.id!==undefined&&message.method){
        write({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Unsupported workbench request'}});
        fail('Codex requested an action unavailable in read-only planning.');
      }else if(event.threadId&&event.threadId!==threadId||event.turnId&&event.turnId!==turnId){
        return;
      }else if(message.method==='item/agentMessage/delta'){
        onEvent({delta:event.delta});
      }else if(message.method==='item/started'||message.method==='item/completed'){
        const item=event.item;
        if(item.type==='plan'&&message.method==='item/completed')plan=item.text;
        else if(item.type==='agentMessage'&&message.method==='item/completed')onEvent({text:item.text,final:true});
        else if(['commandExecution','fileChange'].includes(item.type))onEvent({tool:{id:item.id,label:item.command??'File changes',status:item.status,output:item.aggregatedOutput}});
      }else if(message.method==='turn/completed'&&event.turn.id===turnId){
        if(event.turn.status!=='completed'){fail(event.turn.error?.message??'Codex planning was interrupted.');return;}
        if(plan&&planning)onEvent({text:plan+'\n<!-- skills-space:plan-ready -->',final:true});
        finished=true;onEvent({done:true});end();
      }else if(message.method==='error'&&!event.willRetry){
        fail(event.error?.message??'Codex planning failed.');
      }
    },
    answer(answers){
      if(pending===undefined||submitted||finished)return;
      submitted=answers;
      write({jsonrpc:'2.0',id:pending,result:{answers}});
    },
    stop(){
      if(finished||!turnId)return false;
      if(!interrupted){interrupted=true;send(4,'turn/interrupt',{threadId,turnId});}
      return true;
    }
  };
}
