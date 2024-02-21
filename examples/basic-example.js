
import config from './config/dev.js';
import MoonrakerClient from '../moonraker-client.js'

const moonrakerclient = new MoonrakerClient(config)

async function main(){
  try {
    const query = await moonrakerclient.queryPrintStatus()
    console.log('Maros:', query)
  }
  catch(err){
    console.log('ERROR from query:',err)
  }

  moonrakerclient.close()

}


moonrakerclient.on('open', main)