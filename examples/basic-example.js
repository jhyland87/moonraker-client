
const sprintf         = require('sprintf-js').sprintf
const chalk           = require('chalk');
const MoonrakerClient = require('../')({})





async function getRootExplorer(){
  const roots = await MoonrakerClient.listRoots()
  //console.log('roots:',roots)

  roots.forEach(async root => {
    console.log(sprintf('Root Folder %-35s -> %20s %s', chalk.yellow.bold(root.name), chalk.dim.italic(`[${root.permissions}]`), chalk.white.italic(root.path)))
    const files = await MoonrakerClient.getRootContents(root.name)
    ///console.log(files)
  })


  return roots
}


async function getFilesInRoot(root){

  const rootContents = await MoonrakerClient.getRootContents(root);

  console.log('rootContents:',rootContents)

  return Object.fromEntries(rootContents);

}

async function mainFunction(d){
  const roots = await getRootExplorer();

  MoonrakerClient.close()
}

MoonrakerClient.on('open', mainFunction)


