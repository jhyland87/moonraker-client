import { WebSocketServer, WebSocket } from 'ws';
import EventEmitter from 'events';
import { Buffer } from 'node:buffer';
import * as axios from 'axios'
//import * as net from 'net'
import * as tcpPortUsed from 'tcp-port-used'

import SOCKET_STATES from './socket_states.js'
import * as utils from './utils.js'
//import {isUUID} from './utils.js'


/*
https://github.com/theturtle32/WebSocket-Node/blob/master/lib/WebSocketConnection.js#L143C21-L171
*/
export default class MoonrakerClient extends EventEmitter {
  #config = {};
  #wsOptions = {
    handshakeTimeout: 1000
  };
  #ws;
  #pingTimeout = null;
  #heartbeatTimeout = (30000 + 1000); // 31 seconds
  #wsURL;
  #requestCounter = 0;
  #wsStatus = undefined

  constructor(config){
    super()

    if ( ! config?.API?.connection ) {
      throw new Error(`No API.connection found in config`)
    }

    this.#config = config.API.connection

    this.#socketInit()
  }

  /**
   * Initialize the websocket connection
   */
  #socketInit(){
    if ( ! this.#wsURL )
      this.#wsURL = MoonrakerClient.#makeWsURL(this.#config);

    this.#ws = new WebSocket(this.#wsURL, this.#wsOptions || {})

   
    this.#ws.on( 'message', data => this.#ws_onMessage(data))

    this.#ws.on( 'error',   data => this.#ws_onError(data))

    this.#ws.on( 'error',   error => {
      console.log('error.code:', error?.code)
      console.log('error.message:', error?.message)
      console.log('getOwnPropertyNames:',Object.getOwnPropertyNames(error))
      //throw error
    })

    /*
    this.#ws.on( 'message', data => console.log('WS message:',data))
    this.#ws.on( 'close',   data => console.log('WS close:',data))
    this.#ws.on( 'open',    data => console.log('WS open:',data))
    this.#ws.on( 'ping',    data => console.log('WS ping:',data))
    */

    this.#ws.on( 'close',   data => this.#ws_onClose(data))
    this.#ws.on( 'open',    data => this.#ws_onOpen(data))
    this.#ws.on( 'ping',    data => this.#ws_onPing(data))
  }

  /**
   * Heartbeat for checking on the connection status
   * NOTE: This may need to be a public method..
   */
  #heartbeat(timeout){
    
    if ( this.#pingTimeout !== null ){
      clearTimeout(this.#pingTimeout);
    }

    // Use `WebSocket#terminate()`, which immediately destroys the connection,
    // instead of `WebSocket#close()`, which waits for the close timer.
    // Delay should be equal to the interval at which your server
    // sends out pings plus a conservative assumption of the latency.
    this.#pingTimeout = setTimeout(() => {
      this.terminate();
    }, timeout || this.#heartbeatTimeout );
  }

  /**
   * 
   */
  #ws_on(onWhat, callback){
    this.#ws.on(onWhat, callback)
  }


  /**
   * 
   */
  #ws_onError(data){
    //return
    console.log('[onError], data:', data)
    console.log('[onError], arguments:', arguments)
    this.emit('error', data)
  }

  /**
   * Executed for OPEN event 
   */
  #ws_onOpen(data){
    this.emit('open')
    this.#heartbeat();
  }

  /**
   * Executed for PING event 
   */
  #ws_onPing(data){
   this.#heartbeat();
  }

  /**
   * Executed for CLOSE event 
   */
  #ws_onClose(data){
    if ( this.#pingTimeout !== null ){
      clearTimeout(this.#pingTimeout); 
    }

    this.emit('close', data)

  }

  /**
   * Executed for MESSAGE event 
   */
  #ws_onMessage(data){
    try {
      const messageObj = JSON.parse(data.toString())

      if ( messageObj.id ){
        this.emit(`response:${messageObj.id}`, messageObj);
      }

      if ( messageObj.method ){
        this.emit(`method:${messageObj.method}`, messageObj);
      }
    }
    catch(err){
      console.log('ERROR:',err)
      this.emit(`error`, err);  
      this.emit(`error:${err.code || "nocode"}`, err);  
    }
  }

  /**
   * Convert an object into a payload buffer (which can be sent to a websocket server)
   * 
   * @param   {Object}        payload   Payload to send
   * @return  {PayloadBuffer}           An object containing the request ID and buffer
   * @example 
   *  // Inserts a generated unique ID into the object and converts it to the buffer.
   *  MoonrakerClient.#payloadBuffer({ foo: 'bar' }) 
   *    
   * @example
   *  // Converts the payload to a buffer with the ID 123 
   *  MoonrakerClient.#payloadBuffer({ id: 123, foo: 'bar' }) 
   */
  static #payloadBuffer(payload){
    if ( ! payload || typeof payload !== 'object' )
      throw new Error(`Faile to create buffer from payload object; Payload either undefined or of invalid type (${typeof payload}`)

    if ( ! payload.id )
      payload.id = ++this.#requestCounter;

    const payloadStr = JSON.stringify(payload);

    return {
      id: payload.id,
      buffer: Buffer.from(payloadStr, 'utf-8')
    };
  }

  /**
   * Make Websocket URL from config values
   * @param   {object}  cfg   Config object
   * @return  {string}
   */
  static #makeWsURL( cfg ) {
    if ( ! cfg?.server  )
      throw new Error("No websocket SERVER specified")

    return `ws://${cfg.server}:${cfg?.port || 80}${cfg?.path || '/websocket'}`;
  }

  /**
   * Simple config getter, to make it read only to the public 
   */
  get config(){
    return this.#config
  }

  /**
   * Check port responsiveness
   * 
   * @param {number}  port      Port to connect to
   * @param {number}  timeout   Timeout to use (defaults to config timeout)
   */
  checkPort2(port, timeout){
    return new Promise((resolve, reject) => {
      let socket, timer;
      const reqTs = Date.now();

      const testHost = this.#config.server
      const testPort = port ||this.#config.port
      const testTimeout = timeout || this.#config.timeout

      timer = setTimeout(() => {
        socket.end();

        const err = new Error(`Exceeded timeout of ${testTimeout}ms trying to connect to ${testHost}:${testPort}`)
        
        err.result = `Exceeded ${testTimeout}ms timeout`
        err.host = testHost
        err.port = testPort
        err.timeout = testTimeout
        err.responseTime = Date.now() - reqTs
        
        reject(err)
      }, testTimeout);

      socket = net.createConnection(testPort, testHost, () =>  {
        clearTimeout(timer);
        resolve({
          result: 'successful',
          responseTime: Date.now() - reqTs
        });
        socket.end();
      });

      socket.on('error', err => {
        clearTimeout(timer);

        if ( ! err.result )
          err.result = `Encountered socket error event`

        if ( ! err.responseTime ) 
          err.responseTime = Date.now() - reqTs

        err.host = testHost
        err.port = testPort
        err.timeout = testTimeout
    
        reject(err);
      });

      socket.on('close', data => console.log('Socket triggered close event, with data:',data))
      socket.on('connection', data => console.log('Socket triggered connection event, with data:',data))
      socket.on('listening', data => console.log('Socket triggered listening event, with data:',data))
      socket.on('drop', data => console.log('Socket triggered drop event, with data:',data))
      //close connection error listening drop 

    });
  }

  /**
   * Much simpler method of checking if a port is open or not.  
   */
  async checkPort(port = this.#config.port){
    try {
      return await tcpPortUsed.check(port, this.#config.server)
    }
    catch(err){
      return false
    }
  }

  /**
   * Send a payload to the websocket service
   * 
   * @param   {Object}  payload   Object to form payload from and send
   * @return  {number}            Unique request ID for this payload            
   * @example 
   *  // Sends a websocket request
   *  const data = await MoonrakerClientObj.sendPayload({ foo: 'bar' })
   */
  async send( payload ){
    const requestObj = MoonrakerClient.#payloadBuffer( payload );

    try {
      // Send the websocket request
      await this.#ws.send(requestObj.buffer)

      return payload.id
    }
    catch(err){ 
      console.error(`[%s] ERROR while sending the request id %s:`, err.code, payload.id , err)
      return err        
    }
  }

  /**
   * Send a payload req to the websocket server and return a promise.
   * 
   * @see  {@link https://moonraker.readthedocs.io/en/latest/web_api/#json-rpc-api-overview|json-rpc-api-overview}
   * @param {string}  method  Method to call
   * @param {Object}  params  The parameters to integrate into the payload
   * @return {Promise<Result>}
   * @example 
   *    // Retrieves a list of printer objects (no params)
   *    MoonrakerClient.request('printer.objects.list')
   *      .then(res => console.log('Primter objects:', res))
   * 
   * @example 
   *    // Retrieves the metadata for someFile.gcode
   *    MoonrakerClient.request('server.files.metadata', {filename: 'someFile.gcode'})
   *      .then(res => console.log('Metadata for someFile.gcode:', res))
   */
  request(method, params){
    return new Promise((resolve, reject) => {
      
      // Payload to send..
      const payload = {
        jsonrpc: "2.0",
        method: method,
        id: ++this.#requestCounter
       // id: requestId
      }

      if ( params ){
        payload.params = params;
      }

      try {

        // Create the event using the ID..
        this.once(`response:${payload.id}`, data => {
          // If there was an error in the response, then reject the promise with the error object
          if ( data.error ) 
            return reject(data.error)

          // Otherwise, return the result (if its there, otherwise, return the data object)
          return resolve(data?.result)
        })

        // Send the request - This will trigger the event using
        // the unique ID once its received.
        this.send(payload);
      }
      catch(err){
        return reject(err)
      }
    })   
  }

  /**
   * Subscribe to printer objects
   * @param   {Object}  objects   Printer objects to subscribe to
   * @see https://moonraker.readthedocs.io/en/latest/web_api/#subscribe-to-printer-object-status
   * @note  The HTTP API requires that a connection_id is passed via the query string or as part 
   *        of the form. This should be the ID reported from a currently connected websocket. A 
   *        request that includes only the connection_id argument will cancel the subscription on 
   *        the specified websocket.
   */
  subscribe(objects){
    return new Promise((resolve, reject) => {
      // Payload to send..
      const payload = {
        jsonrpc: '2.0',
        method: 'printer.objects.subscribe',
        params: { objects },
        id: ++this.#requestCounter
       // id: requestId
      }

      // Create a unique event ID to track this response by
      const uniqueEvent = `response:${payload.id}`;

      // Create the event using the ID..
      this.once(uniqueEvent, data => resolve(data))

      this.send(payload);
    })
  }

  /**
   * Unsubscribe from a method
   * @see https://moonraker.readthedocs.io/en/latest/web_api/#subscribe-to-printer-object-status
   * @note  The HTTP API requires that a connection_id is passed via the query string or as part 
   *        of the form. This should be the ID reported from a currently connected websocket. A 
   *        request that includes only the connection_id argument will cancel the subscription on 
   *        the specified websocket.
   */
  unsubscribe(from){
    return new Promise((resolve, reject) => {
      let payload = {
         jsonrpc: "2.0",
         method: 'printer.objects.subscribe',
         params: {
            objects: {}
         }
      }

      if ( typeof from == 'number' ){
        payload.id = from
      }
      else if ( typeof from === 'objects' ){
        payload.params.objects = from;
      }
      else {
        return reject(`Invalid value provided (of type ${typeof from}): ${from}`)
      }

       // Create a unique event ID to track this response by
      const uniqueEvent = `response:${payload.id}`;

      // Create the event using the ID..
      this.once(uniqueEvent, data => resolve(data))

      this.send(payload);      
    })
  }

  /**
   * Download file from Moonraker server
   * 
   * @param   {string}  filename  Filename to download (full path)
   * @returns {Promise<axios>}    Axios promise for HTTP GET request
   * @example 
   *  // Downloads klippy.log
   *  const response = await moonrakerClient.downloadFile('/server/files/klippy.log')
   */
  downloadFile(filename){
    if ( filename.startsWith('/') === false ){
      filename = `/${filename}`
    }

    return axios.get(`http://${this.#config?.server}:${this.#config?.port || 80}${filename}`)
  }

  /**
   * Retrieve a list of available printer objects to query
   * 
   * @see https://moonraker.readthedocs.io/en/latest/web_api/#list-available-printer-objects
   * @returns {Promise<Result>}   List of printer objects (Array of strings)
   */
  getObjectsList(){
    return this.request('printer.objects.list');
  }

  /**
   * Get Printer Info - Queries data from printer.info method
   * 
   * @see https://moonraker.readthedocs.io/en/latest/printer_objects/
   * @see https://moonraker.readthedocs.io/en/latest/web_api/#query-printer-object-status
   * @param {(object|array|string)}   objects   The list (and possibly attributes) of objects 
   *                                            to retrieve data for. This can be an...
   *                                            - Object: with the object name as key and
   *                                              attributes as values.
   *                                            - Array of objects (will retrieve all attributes 
   *                                              for listed objects)
   *                                            - String of just a single object to retrieve all 
   *                                              attributes for
   * @return {Promise<ObjectStatus>}  Response object from printer
   * @example 
   *  // Gets 'position' and 'print_time' attributes of toolhead object, and all attributes of print_stats
   *  MoonrakerClient.queryObjects({"toolhead": ["position","print_time"], "print_stats": None})
   * @example 
   *  // Gets just 'position' attr of toolhead object, and all attributes of print_stats
   *  MoonrakerClient.queryObjects({"toolhead": "position", "print_stats": None})
   * @example 
   *  // Gets all attributes of toolhead and print_stats objects
   *  MoonrakerClient.queryObjects(["toolhead","print_stats"])
   * @example 
   *  // Gets all attributes of just print_stats object
   *  MoonrakerClient.queryObjects("print_stats")
   */
  queryObjects(objects){
    if ( typeof objects === 'object'){
      // If we were given an array of printer objects...
      if ( Array.isArray(objects)){
        // ... convert to an object full of null values
        objects = Object.fromEntries(objects.map(o => [o, null]));
      }
      // If it was an actual object..
      else {
        // ... make sure the values are either null or an array.
        for( const [name, attrs] of Object.entries(objects)){
          if ( attrs !== null && Array.isArray(attrs) === false ){
            objects[name] = [attrs]
          }
        }
      }
    }
    // If given a string...
    else if( typeof objects === 'string'){
      // Convert it into an object using the string as key, and a null value (to retrieve
      // all attributes)
      const object = objects;
      objects = {}
      objects[object] = null
    }
    else {
      throw new Error(`Expected an object, array or string to retrieve printer objects, ` 
        + `but was given a typeof '${typeof objects}'.`);
    }

    return this.request('printer.objects.query',{ objects })
  }

  /**
   * Get the current status of whatever the printer is currently printing
   * 
   * @return {Promise<ObjectStatus>}  Response object from printer
   */
  queryPrintStatus(){
    return this.queryObjects({
      webhooks: null,
      virtual_sdcard: null,
      gcode_move: ['speed_factor','speed'], 
      print_stats: null,
      display_status: null,
      toolhead: ['print_time','stalls','estimated_print_time']
    })

    return  this.queryObjects([
      'webhooks',
      'virtual_sdcard',
      'gcode_move',
      'print_stats',
      'display_status',
      'virtual_sdcard',
      'toolhead'
    ])
  }

  /**
   * @typedef   {Object}  KlippyLog
   * @property  {string}  raw_line  - full unmodified log line
   * @property  {string}  log_type  - Type of log (ERROR, INFO or WARNING)
   * @property  {Date}    date      - Date instance with the log date
   * @property  {string}  account   - Account the log was created by
   * @property  {string}  service   - Service that created the log entry
   * @property  {string}  context   - work_handler, invoke_shutdown, logging_callback, etc
   * @property  {string}  details   - The log entry itself (without the timestamp, account, type, etc)
   * @property  {Array}   multiline - Array of associated lines following the main line
   * @property  {Array}   stack     - Array of stacktrace lines following the main error
   */

  /**
   * Parse the klippy.log file for any of the recent log entries. This can be used to
   * populate a console prior to any WebSocket events creating new logs
   * 
   * @todo  Include stack traces in the log entries
   * @todo  Better parsing logic can be found at: 
   *          https://github.com/Klipper3d/klipper/blob/master/scripts/logextract.py
   * @param   {Array|string}  logtype   Type(s) of logs to return. Can be any of:
   *                                    INFO, WARNING or ERROR
   * @param   {boolean}       detailed  Determines if the stacktrace or additional
   *                                    lines (if there are any) should be included.
   *                                    If true, then stacktraces will be returned in
   *                                    the 'stack' property, and other types of extra 
   *                                    lines will be in the 'multiline' property.
   * @param   {string}        logfile   Which klippy log file to retrieve and parse
   * @returns {KlippyLog[]}   Array of <KlippyLog> objects
   * @example
   *    moonrakerClient.parseKlippyLogs()
   *      // Returnes array of parsed klippy.log
   * @example
   *    moonrakerClient.parseKlippyLogs({detailed: true})
   *      // Returnes array of detailed logs from the current klippy.log
   * @example
   *    moonrakerClient.parseKlippyLogs({logtype:['INFO','WARNING']})
   *      // Returnes array of info and warning logs from klippy.log
   * @example
   *    moonrakerClient.parseKlippyLogs({logtype:['INFO','WARNING'], detailed: true})
   *      // Returnes array of deteiled errors from the current klippy.log
   * @example
   *    moonrakerClient.parseKlippyLogs({logtype:'ERROR', detailed: true, logfile:'klippy.log.3'})
   *      // Returnes array of deteiled errors from klippy.log.3
   */
  // No idea why this type of parameter setup won't work >_<
  //async parseKlippyLogs({logfile='klippy.log', detailed=false, logtype=null}){ 
  async parseKlippyLogs(params = {detailed: false, logfile: 'klippy.log', logtype:null}){
    //{logType=null, detailed=false, logfile='klippy.log'}
    const {logtype, detailed, logfile} = params

    const ignoredServices = ['statistics', 'serialhdl']

    const ignoredContexts =['dump_request_log','_dump_debug','_record_local_log', 
      '__init__', '_mcu_identify','check_slr_camera','work_handler','verify_heater',
      'logging_callback','set_rollover_info', '_local_log_save','set_client_info',
      'usb_reset','dump_file_stats','_handle_rpc_registration','_send_config',
      'print_generated_points','_handle_shutdown','cmd_SDCARD_PRINT_FILE',
      'handle_connect']

    let log_type = ['ERROR','INFO','WARNING']

    // If only a single log type..
    if ( typeof logtype === 'string' ){
      log_type = [ logtype.toUpperCase() ]
    }
    // Or multiple..
    else if ( Array.isArray(logtype)){
      if ( logtype.length > 0){
        log_type = logtype.map(t => t.toUpperCase())
      }
    }
    // just treat a boolean as a null, and anything else should fail
    else if ( typeof logtype === 'boolean'){
      throw new TypeError(`Unexpected value for log type. Expected a string or array, received a type ${typeof logtype}: ${logtype}`)
    }

    const logLinePtrn = new RegExp(`\\[(?<log_type>${log_type.join('|')})\\] (?<date>\\d{4}\\-\\d{2}\\-\\d{2} \\d{2}:\\d{2}:\\d{2}),\\d{1,3} \\[(?<account>[a-z]+)\\] \\[(?<service>[a-zA-Z_-]+):(?<context>[a-zA-Z_-]+):(\\d+)\\] (?<details>.*)$`, 'gm')
    const logRolloverLinePtrn = new RegExp('^=+ Log rollover at (?<rollover_date>.*) =+$', 'g')

    const logTypeIdx = {}
    const logEntries = []
    let logRolloverDate = null

    // Logs only save if this is set to true, which needs to be done _after_ the log rollover line
    let saveLogs = false

    const logFileContent = await this.downloadFile(`/server/files/${logfile}`)

    const logLines = logFileContent.data.split('\n')

    logLines.forEach((line, idx, arr) => {
      // If we aren't yet parsing logs, then check if this is the rollover line pattern, which
      // would then enable log parsing
      if ( saveLogs === false ){
        logRolloverLinePtrn.lastIndex = 0

        const rolloverCheck = logRolloverLinePtrn.exec(line)

        if ( rolloverCheck !== null ){
          logRolloverDate = rolloverCheck.groups.rollover_date;
          saveLogs = true
        }
        
        return
      }

      logLinePtrn.lastIndex = 0

      // Check if this line matches the new log entry pattern
      let lineMatch = logLinePtrn.exec(line)

      // If this is a new log entry, then add it to the results
      if ( lineMatch ){
        //console.log(line); return
        const lineMatches = {...lineMatch.groups}

        // Ignore if necessary
        if ( ignoredServices.includes(lineMatches.service)
          || ignoredContexts.includes(lineMatches.context) 
          || lineMatches.details.startsWith('Args:')
          || lineMatches.details.startsWith('gcode state:')) {
          return
        }

        lineMatches.raw_line = line;

        lineMatches.date = new Date(Date.parse(lineMatches.date))

        //console.log('match.groups:',{...lineMatch.groups})
        logEntries.push(lineMatches)
        return
      }

      // Don't bother processing the remaining lines if not needed
      if ( detailed !== true ){
        return
      }

      // If it doesn't match, then its possible this line is just more details for the previous
      // line (if there isn one)

      // If there isn't a previous line, then assume this is junk, and move on
      if ( logEntries.length === 0 ) return

      const lastLogIdx = logEntries.length-1

      // If this line starts with Traceback, then create the stack array.
      if ( line.startsWith('Traceback') === true ){
        if ( ! logEntries[lastLogIdx]?.stack ){
          logEntries[lastLogIdx].stack = []
        }

        logEntries[lastLogIdx].stack.push(line)
        return
      }

      // If this line isn't ^Traceback, but the stack array does exist, then process this as
      // another line for the existing stack
      if ( logEntries[lastLogIdx]?.stack ){
        logEntries[lastLogIdx].stack.push(line)
        return
      }
      
      // any other scenario would mean this is just an additional line for the previous log
      if ( ! logEntries[lastLogIdx]?.multiline ){
        logEntries[lastLogIdx].multiline = []
      }

      logEntries[lastLogIdx].multiline.push(line)
    })

    return logEntries
    /*
    //
    // =====
    // 

    const logPattern = new RegExp('^\\[(?<log_type>ERROR|INFO)\\] (?<date>\\d{4}\\-\\d{2}\\-\\d{2} \\d{2}:\\d{2}:\\d{2}),\\d{1,3} \\[(?<account>[a-z]+)\\] \\[(?<service>(?!bed_mesh|virtual_sdcard|webhooks|__init__|statistics|gcode_move)[a-zA-Z_-]+):(?<category>(?!_record_local_log|set_rollover_info|_dump_debug|usb_reset|invoke_shutdown|move|dump_file_stats)[a-zA-Z_-]+):(\\d+)\\] (?<details>.*)$', 'gm')

    const consoleHistory = []

    const logFile = await this.downloadFile('/server/files/klippy.log')

    const logLines = logFile.data.split('\n')

    logLines.forEach((line, idx, arr) => {
      const match = logPattern.exec(line)
      if ( match === null  ){
        return
      }
      const lineMatches = {...match.groups}

      lineMatches.date = Date.parse(lineMatches.date)

      let logType = 'info'
        
      if ( lineMatches.log_type === 'ERROR' ){
        logType = 'error'
      }

      consoleHistory.push(lineMatches)
    })

    return consoleHistory
    */
  }

  /**
   * Look through the printer objects list for any objects starting with 
   * 'gcode_macro', and parse those values for the macro names and return
   * them in an array.
   * 
   * @return {Array}  List of macro names
   */
  async getMacros(){
    const objectsList = await this.getObjectsList()

    return objectsList?.objects
      .filter(o => o.startsWith('gcode_macro '))
      .map(o => o.replace(/^gcode_macro /,''))
  }

  /**
   * Get server info - Queries data from server.info method
   * 
   * @see https://moonraker.readthedocs.io/en/latest/web_api/#query-server-info
   * @return {Promise<Result>}  Server info
   */
  getServerInfo(){
    return this.request('server.info')
  }

  /**
   * Get Server Config - Queries data from server.config method
   * 
   * @see https://moonraker.readthedocs.io/en/latest/web_api/#get-server-configuration
   * @returns {Promise<Result>} 
   */
  getServerConfig(){
    return this.request('server.config')
  }

  /**
   * Get Printer Info - Queries data from printer.info method
   * 
   * @see https://moonraker.readthedocs.io/en/latest/web_api/#get-klippy-host-information
   * @returns {Promise<Result>}
   */
  getPrinterInfo(){
    return this.request('printer.info')
  }

  /**
   * Get Machine System Info - Queries data from machine.system_info method
   * 
   * @see https://moonraker.readthedocs.io/en/latest/web_api/#get-system-info
   * @returns {Promise<Result>}
   */
  getMachineSysinfo(){
    return this.request('machine.system_info')
  }

  /**
   * Get Machine Process Stats- Queries data from machine.proc_stats method
   * 
   * @see https://moonraker.readthedocs.io/en/latest/web_api/#get-moonraker-process-stats
   * @returns {Promise<Result>}
   */
  getMachineProcstats(){
    return this.request('machine.proc_stats')
  }

  /**
   * Initiate a metadata scan for a selected file. If the file has already been scanned the endpoint will force a rescan.
   * 
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#scan-gcode-metadata|server.files.metascan}
   * @param   {string}  filename    Path to the gcode file, relative to the gcodes root
   * @return  {Promise<Result>}  An object containing the metadata resulting from the scan, matching the return value of {@link getMetadata).
   */
  fileMetaScan(filename){
    return this.request('server.files.metascan', {filename})
  }

  /**
   * Get metadata for a specified gcode file.
   * 
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#get-gcode-metadata|server.files.metadata)
   * @param   {string} filename   Path to the gcode file, relative to the gcodes root
   * @returns {Promise<Result>}  Metadata for the requested file if it exists. If any fields failed parsing they will 
   *                    be omitted. The metadata will always include the file name, modified time, and size.
   * @example 
   *  // Gets the metadata for the file Test_Print.gcode
   *  MoonrakerClient.getMetadata("Test_Print.gcode")
   */
  getMetadata(filename){
    return this.request('server.files.metadata', { filename })
  }

  /**
   * Get a list of registered roots
   * 
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#list-registered-roots|server.files.roots}
   * @return  {Promise<Result>}  Object of roots, with keys: config, gcodes, config_examples or docs
   */
  listRoots(){
    return this.request('server.files.roots')
  }

  /**
   * Gets the contents in the root level of one of the directories registered as a root
   * within Moonraker.
   * 
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#list-available-files|server.files.list}
   * @note  This is not a recersive listing. This will retrive only the files in the root
   *        of the name provided. If a more detialed or recursive directory listing is 
   *        needed, then see {@link getDirectory}
   * @param   {string}  root  The root folder. Must be one of config, gcodes, config_examples or docs.
   * @return  {Promise<Result>}   Array of objects for each item in the root specified
   */
  getRootContents(root){
    return this.request('server.files.list', { root } )
  }

  /**
   * This 
   * 
   * @see   {@link https://moonraker.readthedocs.io/en/latest/web_api/#get-directory-information|server.files.get_directory}
   * @note  Returns a list of files and subdirectories given a supplied path. Unlike {@link getRootContents}, this command 
   *        does not walk through subdirectories. This request will return all files in a directory, including files in the 
   *        gcodes root that do not have a valid gcode extension.
   * @param   {string}  path        Path of directory to list
   * @param   {boolean} extended    If supplied and set to true then data returned for gcode files will also include metadata.
   * @return  {Promise<Result>}  Object containing the arrays: dirs, files, disk_usage, root_info.
   */
  getDirectory(path, extended){
    return this.request('server.files.get_directory', { path, extended } )
  }

  /**
   * Get a list of databases/namespaces
   * 
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#list-namespaces|server.database.list}
   * @return  {Promise<Result>}  Object with just the 'namespaces' array
   */
  listDatabases(){
    return this.request('server.database.list')
  }

  /**
   * Retrieve database from a specific database/namespace (and optionally a specific key). 
   * Databases are: moonraker, history, gcode_metadata, fluidd, timelapse, announcements, webcams
   * 
   * @param {string}  namespace   Namespace to query (found from server.database.list)
   * @param {string}  key         Key to query (null returns all values) 
   * @return {Promise<Result>}  An object with the keys 'namespace', 'key' and 'value'
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#get-database-item|server.database.get_item}
   * @example 
   *  // Retrieve all history entries
   *  const history = await MoonrakerClient.getDatabaseItem('history')
   *  // Get the console command history
   *  const commandHistory = await MoonrakerClient.getDatabaseItem('fluidd', 'console.commandHistory')
   * 
   */
  getDatabaseItem(namespace, key){
     return this.request('server.database.get_item', { namespace, key })
  }

  /**
   * Inserts an item into the database. If the namespace does not exist it will be created. If the key specifies 
   * a nested field, all parents will be created if they do not exist. If the key exists it will be overwritten 
   * with the provided value. The key parameter must be provided, as it is not possible to assign a value directly 
   * to a namespace.
   * 
   * @param {string}  namespace   Namespace to query (found from server.database.list)
   * @param {string}  key         Key to query (null returns all values) 
   * @return {Promise<Result>}  An object containing the inserted namespace, key, and value.
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#add-database-item|server.database.post_item}
   * @example 
   *  // Retrieve all history entries
   *  const history = await MoonrakerClient.getDatabaseItem('history')
   *  // Get the console command history
   *  const commandHistory = await MoonrakerClient.getDatabaseItem('fluidd', 'console.commandHistory')
   * 
   */
  addDatabaseItem(namespace, key, value){
    return this.request('server.database.post_item', { namespace, key, value})
  }

  /**
   * Deletes an item from a namespace at the specified key. If the key does not exist in the namespace an error will 
   * be returned. If the deleted item results in an empty namespace, the namespace will be removed from the database.
   * 
   * @param {string}  namespace   Namespace to delete record from (found from server.database.list)
   * @param {string}  key         Key to delete
   * @return {Promise<Result>}  An object containing the namespace, key, and value of the deleted item.
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#delete-database-item|server.database.delete_item}
   * @example 
   *  // Delete the oldest printer history record
   *  const commandHistory = await MoonrakerClient.deleteDatabaseItem('history', '000000')
   */
  deleteDatabaseItem(namespace, key){
     return this.request('server.database.delete_item', { namespace, key })
  }

  /**
   * Get a list of notifiers
   * 
   * @return {Promise<Result>}  List of notifiers
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#list-notifiers|server.notifiers.list}
   * @return {object}
   */
  listNotifiers(){
    return this.request('server.notifiers.list')
  }

  /**
   * Get a list of notifiers
   * 
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#list-webcams|server.webcams.list}
   * @return {Promise<Result>}
   */
  listWebcams(){
    return this.request('server.webcams.list')
  }

  /**
   * Get webcam information
   * 
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#get-webcam-information|server.webcams.get_item}
   * @param   {string}  name   The webcam name (or UID)
   * @return  {Promise<Result>}
   * @example
   *  // Search for webcam with name "Ender 3 S1 Camera"
   *  MoonrakerClient.getWebcam("Ender 3 S1 Camera");
   */
  getWebcam(name){
    return this.request('server.webcams.get_item', { name })
  }

  /**
   * Resolves a webcam's stream and snapshot urls. If the snapshot is served over http, a test is performed to see if 
   * the url is reachable.
   * 
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#test-a-webcam|server.webcams.test}
   * @param   {string}  name    The webcam name (or UID)
   * @return  {Promise<Result>}
   * @example
   *  // Test webcam named "Ender 3 S1 Camera"
   *  MoonrakerClient.testWebcam("Ender 3 S1 Camera");
   */
  testWebcam(name){
    return this.request('server.webcams.test', { name })
  }



  //
  // CONTROL METHODS
  //

  /**
   * Emergency Stop
   * printer.emergency_stop printer.restart printer.firmware_restart  printer.print.resume
   */
  emergencyStop(){
    // printer.emergency_stop
  }

  /**
   * Restart Host Printer
   */
  restartPrinter(){
    // printer.restart
  }

  /**
   * Restart Klippy
   */
  restartFirmware(){
    // printer.firmware_restart
  }

  /**
   * Start print job
   */
  startPrint(filename){
    // printer.print.start
  }

  /**
   * Pause print job
   */
  pausePrint(){
    // printer.print.pause
  }

  /**
   * Resume print job
   */
  resumePrint(){
    // printer.print.resume
  }

  /**
   * Cancel print job
   */
  cancelPrint(){
    // printer.print.cancel
  }

  // server.restart printer.restart printer.firmware_restart

  /**
   * Reboot the printer
   */
  reboot(){
    // machine.reboot
  }

  /**
   * Shutdown the printer
   */
  reboot(){
    // machine.shutdow
  }
  
  /**
   * Start service
   */
  startService(service){
    // machine.services.start
  }

  /**
   * Stop service
   */
  stopService(service){
    // machine.services.stop
  }

  /**
   * Restart service
   */
  restartService(service){
    // machine.services.restart
  }

  close(){
    return this.#ws.close();
  }
}
//const connection = new WebSocket('ws://192.168.0.50:7125/websocket', { perMessageDeflate: false })