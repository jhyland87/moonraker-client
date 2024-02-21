export default {
  "API": {
    "connection": {
      "type": "https",
      "url": "ws://192.168.0.50:7125/websocket",
      "server": "192.168.0.50",
      "port": 7125,
      "timeout": 1000,
      "path": "/websocket",
      "options": {
        "perMessageDeflate": false
      }
    }
  },
  "graphs": {
    "tempSensors": {
      "title": "Thermals",
      "displayLimit": 30,
      "minTemp": 20,
      "sampleSpacing": 5,
      "showNthLabel": 3,
      "components": {
        "extruder": {
          "displayName": "Ext",
          "color": "orange",
          "metrics": {
            "temperatures": "Temp",
            "targets": "Target",
            "powers": false
          }
        },
        "heater_bed": {
          "displayName": "Bed",
          "color": "red",
          "metrics": {
            "temperatures": "Temp",
            "targets": "Target",
            "powers": false
          }
        }
      }
    }
  }
}