
const sprintf         = require('sprintf-js').sprintf
const chalk           = require('chalk');
const MoonrakerClient = require('../')({})



const logEvent = (name, data) => {
  console.log(sprintf('%30s %35s: %-50s', chalk.dim(new Date().toISOString()), chalk.yellow.italic(name), chalk.white(data)))
}

// logEvent('open', d.toString())


MoonrakerClient.events.on('websocket:method:notify_status_update', data => {
  console.log('data:',data.params[0])

  for( let [obj, stats ] of Object.entries(data.params[0])){
    logEvent(obj, JSON.stringify(stats))
  }
  ///logEvent('notify_status_update', JSON.stringify(data.params[0]))
})

MoonrakerClient.on('open', () => {
  MoonrakerClient.subscribe({
    print_stats: true
    /*
    extruder: ['temperature','target'],
    heater_bed: ['temperature','target'],
    system_stats: true,
    mcu: 'last_stats',
    motion_report: ['live_position','live_velocity'],
    toolhead: ['print_time','stalls','estimated_print_time','position'],
    heater_bed: true
    */
  })

})


//motion_report=live_position,live_velocity&toolhead=print_time,stalls,estimated_print_time,position


//system_stats&mcu&print_stats&display_stats&heaters&heater_bed&probe&motion_report&toolhead