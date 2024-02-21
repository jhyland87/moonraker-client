# moonraker-client
Just a Socket IO client for a Moonraker instance. 
This is somewhat buggy and not very feature rich, as it basically just has the features I needed at the time.


### Note
This is a very simple SocketIO client meant just for Moonraker, written in Javascript.
I do plan on re-doing this in TypeScript, and implementing a class interface that will allow creating classes for other printer management APIs such as OctoPrint. But for now, I just needed something simple for another project I'm working on.


### ToDo
- Add functionality to interact with other 3D printer API services (eg: Octoprint).
  - Should be done using a base class or interface that is extended in the separate Moonraker or Octoprint classes
- Re-write this using TypeScript
- Improve the heartbeat for better connection monitoring and stability
- Better Error handling
- Instead of creating a `EventEmitter` instance and referencing `this.events` for everything, just inherit the EventEmitter class. 