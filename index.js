
const WebSocket = require('ws')
const net = require('net')
//const moonrakerMethods = require('./moonraker-methods-small.json')
const { Buffer } = require('node:buffer');
const EventEmitter = require('node:events');
const utils = require('./utils')
const socketStates = require('./socket_states')

process.env.SUPPRESS_NO_CONFIG_WARNING = 'y';

const config = require('config')

//const eventEmitter = require('./MoonEvents');



class MoonrakerClient {
  #config = {};
  #websocketOptions = {};
  #websocket;
  #pingTimeout = null;
  #heartbeatTimeout = (30000 + 1000); // 31 seconds
  #websocketURL;
  #requestCounter = 0;
  #websocketStatus = undefined
  
  utils = utils;

  /**
   * 
   */
  constructor(configOverrides) {
    if (config.has('API.connection') === false ) {
      throw new Error(`No API.connection found in config`)
    }

    if ( typeof configOverrides === 'object' && Object.keys(configOverrides).length > 0){
      config.util.extendDeep(config.API.connection, configOverrides);

      // Since the config values are immutable, we need to create a new config item with
      // the combined config values.
      config.util.setModuleDefaults('API', config.API.connection);

      this.#config = config.get('API');
    }
    else {
      this.#config = config.get('API.connection')
    }

    // Create the events object
    this.events = new EventEmitter();

    // Then initiate the websocket connection
    this.#socketInit();
  }

  /**
   * 
   */
  static #checkPortStatus(host, port, timeout = 10000){
    return new Promise(function(resolve, reject) {
      let socket, timer;
      const reqTs = Date.now();

      timer = setTimeout(function() {
        const _err = new Error(`timeout trying to connect to host ${host}, port ${port}`);
        _err.responseTime = Date.now() - reqTs
        reject(_err)

        socket.end();
      }, timeout);

      socket = net.createConnection(port, host, function() {
        clearTimeout(timer);
        resolve({
          result: 'successful',
          responseTime: Date.now() - reqTs
        });
        socket.end();
      });

      socket.on('error', function(err) {
        clearTimeout(timer);
        err.responseTime = Date.now() - reqTs
        reject(err);
      });
    });
  }

  /**
   * 
   */
  static #checkPorts(host, ports, timeout){
    return Promise.all( ports.map(p => MoonrakerClient.#checkPortStatus(host, p, timeout) ))
  }

  /**
   * 
   */
  static fileListToFs(fileList){
    // gcodeRootsResp.result.reduce((accumulator, currentValue, index) => mergeDeep(accumulator, path2obj(currentValue.path)), {})
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
    if ( ! cfg.has('server') )
      throw new Error("No websocket SERVER specified")

    return `ws://${cfg.get('server')}:${cfg.get('port') || 80}${cfg.get('path') || '/websocket'}`;
  }

  /**
   * 
   */
  on(event, callback){
    this.#websocket.on(event, callback)
  }

  /**
   * Send a payload to the websocket service
   * 
   * @param   {Object}  payload   Object to form payload from and send
   * @return  {Promise}            
   * @example 
   *  // Sends a websocket request
   *  MoonrakerClientObj.sendPayload({ foo: 'bar' }).then(console.log)
   */
  send( payload ){
    return new Promise((resolve, reject) => {
      //console.log('Sending payload:', JSON.stringify(payload))

      // Create the buffer from the payload (this method will handle the
      // payload verification/etc)
      const requestObj = MoonrakerClient.#payloadBuffer( payload );

      try {
        // Send the websocket request
        this.#websocket.send(requestObj.buffer)

        resolve(payload.id);
      }
      catch(err){ 
        console.error(`[%s] ERROR while sending the request id %s:`, err.code, payload.id , err)
        
        reject(err)
      }
    })
  }

  /**
   * Send a payload req to the websocket server and execute a callback
   * once the response is received.
   * 
   * @param {string}            method  Method to call
   * @param {(Object|function)} params  Either the parameters (object) or 
   *                                  the callback function.
   * @param {function}        cb      callback function.
   *   
   */
  requestSync(method, params, cb){
    if ( typeof params === 'function' ){
      cb = params
      params = undefined
    }

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

    // Create a unique event ID to track this response by
    const uniqueEvent = `websocket:response:${payload.id}`;

    //console.log('Creating unique event:', uniqueEvent)
    //console.log('with payload:', payload)
    // Create the event using the ID..
    this.events.on(uniqueEvent, cb)

    this.send(payload);
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
        this.events.once(`websocket:response:${payload.id}`, data => {
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
      /*
        {
        "jsonrpc": "2.0",
        "method": "printer.objects.subscribe",
        "params": {
            "objects": {
                "gcode_move": null,
                "toolhead": ["position", "status"]
            }
          },
          "id": 5434
        }
      */

      // Payload to send..
      const payload = {
        jsonrpc: '2.0',
        method: 'printer.objects.subscribe',
        params: { objects },
        id: ++this.#requestCounter
       // id: requestId
      }

      //console.log('Sending payload:',payload)
      // Create a unique event ID to track this response by
      const uniqueEvent = `websocket:response:${payload.id}`;

      // Create the event using the ID..
      this.events.once(uniqueEvent, data => {
        //console.log(`[${uniqueEvent}] subscribed - data:`, data)
        resolve(data)
      })

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

      //console.log('Ubsub payload:', payload)

       // Create a unique event ID to track this response by
      const uniqueEvent = `websocket:response:${payload.id}`;

      // Create the event using the ID..
      this.events.once(uniqueEvent, data => {
        //console.log(`[${uniqueEvent}] UNSUBSCRIBE - data:`, data)
        resolve(data)
      })

      this.send(payload);

      
    })
  }

  /**
   * Download webcam snapshot.
   * 
   * Downloads snapshot from http://192.168.0.50/webcam/?action=snapshot
   */
  getSnapshot(){
    // http://192.168.0.50/webcam/?action=snapshot
  }

  /**
   * 
   */
  get config() {
    //console.log('Config for MoonrakerClient is:', this.#config)
    return this.#config
  }

  /**
   * Get the websockets current state
   * 
   * @return {number}   Socket state. One of: CONNECTING (0), OPEN (1), 
   *                    CLOSING (2) or CLOSED (3)
   */
  get state(){
    return socketStates.fromState(this.#websocket?.readyState);
  }

  /**
   * Get the websockets current state code
   * 
   * @return {string}   Socket state code. One of: 0 (CONNECTING), 1 (OPEN), 
   *                    2 (CLOSING) or 3 (CLOSED)
   */
  get stateCode(){
    return this.#websocket?.readyState;
  }
  
  /**
   * 
   */
  #heartbeat(timeout){
    //console.log(`${Date.now()} - Heartbeat`)
    if ( this.#pingTimeout !== null ){
      clearTimeout(this.#pingTimeout);
    }

      // Use `WebSocket#terminate()`, which immediately destroys the connection,
      // instead of `WebSocket#close()`, which waits for the close timer.
      // Delay should be equal to the interval at which your server
      // sends out pings plus a conservative assumption of the latency.
      this.#pingTimeout = setTimeout(() => {
        //this.terminate();
      }, timeout || this.#heartbeatTimeout );
  }

  /**
   * 
   */
  #eventLogger(onEvent){
    return function(){
      //console.log(`Event %s triggered:`, onEvent)
      //console.log.apply(this, arguments)
    }
  }

  /**
   * 
   */
  #socketInit(){
    if ( ! this.#websocketURL )
      this.#websocketURL = MoonrakerClient.#makeWsURL(this.#config);

    this.#websocket = new WebSocket(this.#websocketURL, this.#websocketOptions || {})
        
    this.#websocket.on( 'message', data => this.#websocket_onMessage(data))

    this.#websocket.on( 'error',   data => this.#websocket_onError(data))
    this.#websocket.on( 'close',   data => this.#websocket_onClose(data))
    this.#websocket.on( 'open',    data => this.#websocket_onOpen(data))
    this.#websocket.on( 'ping',    data => this.#websocket_onPing(data))
  }

  /**
   * 
   */
  #logWebsocketEvent(label, data){
    if ( ! data && typeof label === 'object' ){
      data = label;
      label = null;
    }
    //console.log('Websocket event: ')
  }

  /**
   * 
   */
  #websocket_on(onWhat, callback){
    this.#websocket.on(onWhat, callback)
  }

  /**
   * 
   */
  #websocket_onError(data){
    return
    console.log('[onError], data:', data)
    console.log('[onError], arguments:', arguments)
  }

  /**
   * Executed for OPEN event 
   */
  #websocket_onOpen(data){
    this.#heartbeat();
  }

  /**
   * Executed for PING event 
   */
  #websocket_onPing(data){
   this.#heartbeat();
  }

  /**
   * Executed for CLOSE event 
   */
  #websocket_onClose(data){
    clearTimeout(this.#pingTimeout); 
  }

  /**
   * Executed for MESSAGE event 
   */
  #websocket_onMessage(data){
    try {
      const messageObj = JSON.parse(data.toString())
      //console.log('Message:', messageObj)

      if ( messageObj.id ){
        //console.log(`Triggering: websocket:response:${messageObj.id}:`,messageObj);
        this.events.emit(`websocket:response:${messageObj.id}`, messageObj);
      }

      if ( messageObj.method ){
        //console.log('Message for method:',messageObj.method)
        this.events.emit(`websocket:method:${messageObj.method}`, messageObj);
      }
    }
    catch(err){
      this.events.emit(`websocket:error`, err);  
      this.events.emit(`websocket:error:${err.code || "nocode"}`, err);  
    }
  }

  /**
   * Just a very siple wrapper to resolve filtered promise data (instead of the original promise data)
   * 
   * @param   {Promise}   promise   Promise to wrap
   * @param   {function}  fn        Function to pass the resolved data through
   * @return  {Promise}
   * @example
   *  // Return the klipper namespaces as an array, instead of an object with the 'namespaces' array
   *  this.#returnPromiseData(this.request('server.database.list'), d => d.namespaces)
   */
  #returnPromiseData(promise, fn){
    return new Promise(function(resolve, reject) {
      promise
        .then( data => resolve(fn(data)))
        .catch(reject)
    })
  }


  //
  // Moonraker Specific Method Calls
  // 

  /**
   * @typedef {Promise} ObjectStatus
   * @property {object} result              Response body of query request
   * @property {float}  result.eventtime    Timestamp generated by Klipper when the update 
   *                                        was originally pushed. This timestamp is a float 
   *                                        value, relative to Klipper's monotonic clock.
   * @property {object} result.status       Status of all the objects that were requested.
   * @see https://moonraker.readthedocs.io/en/latest/web_api/#query-printer-object-status
   */

  /**
   * @typedef   {Object} PayloadBuffer
   * @property  {number} id      The unique request ID
   * @property  {Buffer} buffer  UTF-8 encoded buffer
   */

  /**
   * @typedef {Promise} Result
   * @property {Object|Array} The result of the SocketIO request.
   */


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
      throw new Error(`Expected an object, array or string to retrieve printer objects, but was `
        + `given a typeof '${typeof objects}'.`);
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

  close(){
    return this.#websocket.close();
  }
}

module.exports = config => new MoonrakerClient(config)

/*

const dbConfig = config.get('Customer.dbConfig');
db.connect(dbConfig, ...);

if (config.has('optionalFeature.detail')) {
  const detail = config.get('optionalFeature.detail');
  //...
}


function MoonrakerClient(config) {
    console.log('Loading MoonrakerClient with:', config)

    this.config = config;

    const wsClient = new WebSocket(config.host, config.options || {})


    this.getConfig =  (data) => {
       console.log('MoonrakerClient config:', this.config)
    };

    return this
};

*/
