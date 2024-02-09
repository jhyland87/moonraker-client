
const sprintf         = require('sprintf-js').sprintf
const MoonrakerClient = require('../')({})


const FMT = `%-8s %-10s %-10s %-10s %s`


const historyEntry = (idx, hist) => {
  console.log(sprintf(FMT,  
    idx, 
    hist.status,
    hist.print_duration.toFixed(2), 
    hist.filament_used.toFixed(2), 
    hist.filename)
  )
}

async function showLatestHistory(){
  let printHistory = await MoonrakerClient.getDatabaseItem('history')

  printHistory = Object.entries(printHistory.value).reverse().slice(0, 10)

  console.log(sprintf(FMT,   'ID',  'STATUS', 'DURATION', 'FILAMENT', 'FILENAME' ))

  for( let [ histIdx, entry ] of printHistory ){
    historyEntry(histIdx, entry)
  }

  MoonrakerClient.close()
}

MoonrakerClient.on('open', showLatestHistory)
