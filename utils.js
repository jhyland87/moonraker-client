


/**
 * Test if a string is a valid UUID formatted ID
 * 
 * @see {@link https://www.rfc-editor.org/rfc/rfc4122|RFC4122}
 * @param   {string}  uuid  String to check for RFC4122 status.
 * @return  {boolean}
 */
export const isUUID = uuid => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)

/**
 * Just a simple function to check if a variable is an object or not
 * 
 * @param   {*} obj   Variable to analyze
 * @return  {boolean}
 */
export const isObject = (obj) => (obj && typeof obj === 'object' && !Array.isArray(obj));

/**
 * Filter out an object using a callback, much like the Array.prototype.filter method
 * 
 * @param {object}    obj       Object to filter
 * @param {function}  filterFn  Filter function
 * @example
 *  // returns {b: 'aa'}
 *  filterObj({a: 123, b: 'aa'}, (val, key, obj) =>  typeof val === 'string') 
 */
export const filterObj = (obj, filterFn) => {
  let r = Object.entries(obj).filter(([key, val], obj) => filterFn(val, key, obj));

  return Object.fromEntries(r)
}

/**
 * Takes a path value and returns an object - used for displaying gcode files in
 * an explorer, which requires an object. Each sub-folder is converted into a
 * nested object
 * 
 * @param   {string}  path              Path of file/folder
 * @param   {string}  parent            Parent folder to prepend to path property
 * @param   {boolean} excludePathProp   If this is set to true, then the files
 *                                      path will not be added as a property 
 *                                      in the files results.
 * @return  {object}        Multi-layered object.
 * @example 
 *    path2obj('a/b/c.gcode', true) // {"a": { "b": { "c.gcode": {} } }}
 */
export const path2obj = (path, parent, excludePathProp) => {
  const pathSegments = path.split('/');
  let obj
  let o = obj = {};

  if ( typeof parent === 'string' )
    path = `${parent}/${path}`

  pathSegments.forEach((key, idx, arr) => {
    //console.log('key:', key)
    //console.log('idx:', idx)
    //console.log('arr:', arr)
    //console.log('arr.length-1:', arr.length-1)
      
    let r = {}
    let k = key

    if ( idx === arr.length-1 && excludePathProp !== true ){
      r = {path}
    }
    //else  k = `${k}/`
      
    o=o[k]=r
  });

  return obj
}

/**
 * Perform a deep merge on multiple objects. This is more useful than simply using the
 * Object.assign() or spread operators, as this won't remove any of the other objects
 * or values nested in either object (unless the merging objects has the same key)
 * 
 * @source https://stackoverflow.com/a/34749873
 * @param   {object}  target      Object to merge merge all other objects into (can 
 *                                just be {} to return the new object)
 * @param   {object}  ...sources  All other objects to merge into target and return
 * @return  {object}              Returns the new target object
 * @example 
 *    const obj = {a: {b: { c: 'C'}}}
 *    mergeDeep( obj, {a: {b: { d: 'D'}},e: 'test'} )
 *    // Sets obj to (and returns):
 *    {
 *      "a": { "b": {"c": "C","d": "D"}},
 *      "e": "test"
 *    }
 * 
 * @example
 *    mergeDeep( {}, {a: {b: { c: 'C'}}}, {a: {b: { d: 'D'}},e: 'test'} )
 *    // Returns:
 *    {
 *      "a": { "b": {"c": "C","d": "D"}},
 *      "e": "test"
 *    }
 */
export const mergeDeep = (target, ...sources) => {
  if ( ! sources.length ) 
    return target;

  const source = sources.shift();

  if ( isObject( target ) && isObject( source ) ) {
    for ( const key in source ) {

      if ( isObject( source[key] ) ) {
        if ( ! target[key] ) 
          Object.assign( target, { [key]: {} } );
        
        mergeDeep( target[key], source[key] );
      } 
      else {
        Object.assign( target, { [key]: source[key] } );
      }
    }
  }

  return mergeDeep(target, ...sources);
}

/**
 *
 */
export const mergeDeepArr = (target, sources) => {
  sources.unshift(target)
  return mergeDeep.apply(null, sources)
}

/**
 * Create an object to represent a list of files in a root directory
 * 
 * @param   {array}   rootArr   List of files (from MoonSocket.getRootContents(root))
 * @param   {string}  rootName  Root name to prepend to the pathname for the results
 * @return  {object}  An object to represent the files. Each subfolder in the pathnames
 *                    will create a new nested object.
 */
export const fileRoot2Obj = (rootArr, rootName) => {
  //console.log('rootArr:',rootArr)
  //console.log('rootArr (%s):',rootArr.length. rootArr)

 return rootArr.reduce((accumulator, currentValue, index) => mergeDeep(accumulator, path2obj(currentValue.path, rootName)), {})
}