import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const main=fs.readFileSync(new URL('../Main.qml',import.meta.url),'utf8');
function method(name) {
 const start=main.indexOf('  function '+name+'('), body=main.indexOf('{',start);
 let depth=1,end=body+1;
 for(;depth && end<main.length;end++) {if(main[end]==='{')depth++;else if(main[end]==='}')depth--;}
 return main.slice(start,end);
}
function harness(names, root) {
 const context=vm.createContext({root});
 vm.runInContext(names.map(method).join('\n'),context);
 names.forEach(n=>root[n]=context[n]);
 return root;
}
test('reply routing rejects prefixes and ambiguous names across providers',()=>{
 const root=harness(['matchBot'],{bots:[
  {id:'grok-1',name:'Inbox Admin',shortName:'Inbox Admin',provider:'grokbot'},
  {id:'grok-2',name:'Bob',shortName:'Bob',provider:'grokbot'},
  {id:'hermes:default',name:'Bob',shortName:'Bob',provider:'hermes'}]});
 assert.equal(root.matchBot('Inbox'),null);
 assert.equal(root.matchBot('Bob'),null);
 assert.equal(root.matchBot('Inbox Admin').id,'grok-1');
 assert.equal(root.matchBot('hermes:default').provider,'hermes');
});
test('Grok application visibility never suppresses a Hermes reply cue',()=>{
 const root=harness(['canShowReplyCue'],{present:true,bubbleOpen:false,screensaverUp:false,grokAppOpen:true,findBot:id=>({provider:id})});
 assert.equal(root.canShowReplyCue('grokbot'),false);
 assert.equal(root.canShowReplyCue('hermes'),true);
 root.screensaverUp=true;assert.equal(root.canShowReplyCue('hermes'),false);
});
test('import, export and removal affect only the selected agent',()=>{
 const context=vm.createContext({});
 vm.runInContext(fs.readFileSync(new URL('../qml/openbotavatar.js',import.meta.url),'utf8').replace(/^\.pragma library\n/,''),context);
 const avatar=JSON.parse(fs.readFileSync(new URL('../data/avatars/rocket.json',import.meta.url),'utf8'));
 const root={chosenBotId:'hermes:default',avatarDefinitions:{'grok-1':avatar},avatarStatus:'',saveSettings(){},botLabel:()=> 'Hermes'};
 const ui=vm.createContext({root,Avatar:context});
 vm.runInContext(['avatarFor','importAvatar','exportAvatar','removeAvatar'].map(method).join('\n'),ui);
 for(const n of ['avatarFor','importAvatar','exportAvatar','removeAvatar'])root[n]=ui[n];
 assert.equal(root.importAvatar(JSON.stringify(avatar)),true);
 assert.equal(JSON.parse(root.exportAvatar()).id,avatar.id);
 assert.equal(root.importAvatar('{broken'),false);
 assert.ok(root.avatarFor('hermes:default'));
 root.removeAvatar();assert.equal(root.avatarFor('hermes:default'),null);
 assert.equal(root.avatarFor('grok-1'),avatar);
});

test('settings navigation and provider choice preserve the active agent until a replacement exists',()=>{
 let refreshed=0;
 const root=harness(['openSettings','closeSettings','chooseProvider'],{
  chosenBotId:'grok-1', bots:[{id:'grok-1',provider:'grokbot'},{id:'hermes:default',provider:'hermes'}],
  currentBot(){return this.bots.find(bot=>bot.id===this.chosenBotId)},
  selectBot(id){this.chosenBotId=id},refreshProviders(){refreshed++},wake(){}
 });
 root.openSettings();assert.equal(root.settingsSection,'appearance');assert.equal(root.settingsProvider,'grokbot');
 root.chooseProvider('hermes');assert.equal(root.chosenBotId,'hermes:default');
 root.chooseProvider('hermes');assert.equal(refreshed,0);
 root.bots=root.bots.filter(bot=>bot.provider==='hermes');
 root.chooseProvider('grokbot');assert.equal(refreshed,1);assert.equal(root.chosenBotId,'hermes:default');
 root.settingsSection='avatar';root.closeSettings();assert.equal(root.settingsSection,'appearance');
 root.closeSettings();assert.equal(root.cardPage,'chat');
});

test('generated drafts validate before preview and apply only to the original agent',()=>{
 const context=vm.createContext({});
 vm.runInContext(fs.readFileSync(new URL('../qml/openbotavatar.js',import.meta.url),'utf8').replace(/^\.pragma library\n/,''),context);
 const avatar=JSON.parse(fs.readFileSync(new URL('../data/avatars/rocket.json',import.meta.url),'utf8'));
 let saved=0;
 const root={chosenBotId:'grok-1',avatarDraftBotId:'grok-1',avatarDraft:null,avatarGenerating:false,importAvatar(){saved++;return true}};
 const ui=vm.createContext({root,Avatar:context});
 vm.runInContext(['acceptAvatarDraft','applyAvatarDraft'].map(method).join('\n'),ui);
 assert.equal(ui.acceptAvatarDraft(JSON.stringify(avatar)),true);
 assert.equal(saved,0);
 root.chosenBotId='hermes:default';assert.equal(ui.applyAvatarDraft(),false);assert.equal(saved,0);
 root.chosenBotId='grok-1';assert.equal(ui.applyAvatarDraft(),true);assert.equal(saved,1);
 assert.equal(ui.acceptAvatarDraft('{"script":"bad"}'),false);assert.equal(root.avatarDraft,null);
 assert.equal(ui.applyAvatarDraft(),false);assert.equal(saved,1);
});
