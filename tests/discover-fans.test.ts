import { describe, expect, it } from 'vitest';

import { FakeWebSocket } from './_helpers/fakeWebSocket';

import { MoonrakerClient, parseFanSettings } from '../src';
import type { ClientConfig } from '../src';

const baseConfig: ClientConfig = {
  API: { connection: { server: '127.0.0.1', port: 7125, oneshotToken: false } },
};

// A representative slice of `configfile.settings` covering every kind of key
// the matcher must handle — modeled on dev/printer_objects_query-fan_related.json.
const SAMPLE_SETTINGS: Record<string, unknown> = {
  'output_pin fan0': { value: 0 },
  'output_pin fan1': { value: 0.15 },
  'output_pin fan2': { value: 0 },
  'output_pin led': { value: 1 },
  'temperature_fan chamber_fan': { target_temp: 35 },
  'heater_fan hotend_fan': { heater: 'extruder' },
  'multi_pin heater_fans': { pins: 'PB5,PB2' },
  'static_digital_output my_fan_output_pins': { pins: 'PB6' },
  'gcode_macro M106': { gcode: '' },
  'gcode_macro printer_param': { variable_fans: '3' },
  fan_feedback: { fan0_pin: 'PB4', fan1_pin: 'PC6' },
  stepper_x: { step_pin: 'PC2' },
};

describe('parseFanSettings', () => {
  it('selects only subscribable fan objects', () => {
    const { fans } = parseFanSettings(SAMPLE_SETTINGS);
    const names = fans.map((f) => f.objectName);
    expect(names).toEqual([
      'heater_fan hotend_fan',
      'output_pin fan0',
      'output_pin fan1',
      'output_pin fan2',
      'temperature_fan chamber_fan',
    ]);
  });

  it('excludes non-fan output_pins, pin groups, macros, and sensors', () => {
    const { fans } = parseFanSettings(SAMPLE_SETTINGS);
    const names = fans.map((f) => f.objectName);
    expect(names).not.toContain('output_pin led');
    expect(names).not.toContain('multi_pin heater_fans');
    expect(names).not.toContain('static_digital_output my_fan_output_pins');
    expect(names).not.toContain('gcode_macro M106');
    expect(names).not.toContain('gcode_macro printer_param');
    expect(names).not.toContain('stepper_x');
  });

  it('reports fan_feedback presence without listing it as a fan', () => {
    const { fans, hasFanFeedback } = parseFanSettings(SAMPLE_SETTINGS);
    expect(hasFanFeedback).toBe(true);
    expect(fans.map((f) => f.objectName)).not.toContain('fan_feedback');
  });

  it('assigns the right speedField and temperature flag per kind', () => {
    const { fans } = parseFanSettings(SAMPLE_SETTINGS);
    const byName = Object.fromEntries(fans.map((f) => [f.objectName, f]));

    expect(byName['output_pin fan0']).toMatchObject({
      sectionType: 'output_pin',
      speedField: 'value',
      hasTemperature: false,
      label: 'fan0',
    });
    expect(byName['heater_fan hotend_fan']).toMatchObject({
      sectionType: 'heater_fan',
      speedField: 'speed',
      hasTemperature: false,
      label: 'hotend_fan',
    });
    expect(byName['temperature_fan chamber_fan']).toMatchObject({
      sectionType: 'temperature_fan',
      speedField: 'speed',
      hasTemperature: true,
      label: 'chamber_fan',
    });
  });

  it('returns an empty discovery for settings with no fans', () => {
    expect(parseFanSettings({ stepper_x: {}, extruder: {} })).toEqual({
      fans: [],
      hasFanFeedback: false,
    });
  });
});

describe('MoonrakerClient.discoverFans', () => {
  it('queries configfile.settings and resolves the discovery', async () => {
    const client = new MoonrakerClient(baseConfig, {
      socketFactory: (url) => new FakeWebSocket(url),
    });
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    ws.simulateOpen();

    const promise = client.discoverFans();

    const sent = ws.lastSentPayload<{ id: number; method: string; params: unknown }>();
    expect(sent.method).toBe('printer.objects.query');
    expect(sent.params).toEqual({ objects: { configfile: ['settings'] } });

    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { eventtime: 1, status: { configfile: { settings: SAMPLE_SETTINGS } } },
    });

    const discovery = await promise;
    expect(discovery.hasFanFeedback).toBe(true);
    expect(discovery.fans.map((f) => f.objectName)).toContain('output_pin fan0');
    expect(discovery.fans).toHaveLength(5);
  });
});
