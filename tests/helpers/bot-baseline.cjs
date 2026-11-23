"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const COMMIT='d509ae80dae8e259ceec2200bf939731f42ab2ee';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

// Explicit immutable baseline; never edits the working tree or a remote repo.
async function loadBaseline(){
 const root=path.resolve(__dirname,'../..'),dir=path.join(root,'.local-qa/r4-bot02/baseline');
 const manifestPath=path.join(dir,'manifest.json');
 let manifest;
 if(fs.existsSync(manifestPath))manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 else{
  fs.mkdirSync(path.join(dir,'js'),{recursive:true});manifest={commit:COMMIT,files:{}};
  for(const file of ['bot.mjs','bot-protocol.mjs','bot-worker.mjs','bot-runner.mjs','engine.mjs']){
   const bytes=execFileSync('git',['show',COMMIT+':js/'+file],{cwd:root});
   fs.writeFileSync(path.join(dir,'js',file),bytes);manifest.files[file]=hash(bytes);
  }
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
 }
 if(manifest.commit!==COMMIT)throw Error('Wrong baseline commit');
 for(const [file,expected] of Object.entries(manifest.files))if(hash(fs.readFileSync(path.join(dir,'js',file)))!==expected)throw Error('Baseline changed: '+file);
 return import(pathToFileURL(path.join(dir,'js/bot.mjs')).href);
}
module.exports={loadBaseline,COMMIT,hash};
