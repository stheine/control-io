#!/usr/bin/env node

import {setTimeout as delay} from 'timers/promises';
import fs                    from 'fs';
import fsPromises            from 'fs/promises';

import _                     from 'lodash';
import check                 from 'check-types-2';
import cron                  from 'node-cron';
import mqtt                  from 'async-mqtt';
import ms                    from 'ms';
import pigpio                from 'pigpio';

import logger                from './logger.js';

// ###########################################################################
// Globals

let   buttonHoldTimeout;
const {Gpio}            = pigpio;
let   displayState      = 1;
let   displayBrightness = 70;
let   mqttClient;

// const localHourToUTCHour = function(localHour) {
//   const date = new Date();
//
//   date.setHours(localHour);
//
//   return date.getUTCHours(date);
// };

const schedule = function(hour, minute, weekdays, fct) {
  if(typeof minute === 'boolean') {
    fct      = weekdays;
    weekdays = minute;
    minute   = 0;
  } else if(typeof minute === 'function') {
    fct      = minute;
    weekdays = false;
    minute   = 0;
  } else if(typeof weekdays === 'function') {
    fct      = weekdays;
    weekdays = false;
  }

  check.assert.number(hour);
  check.assert.number(minute);
  check.assert.boolean(weekdays);
  check.assert.function(fct);

  // Note, scheduling for docker containers is done in UTC.
  //
  //             ┌──────────────────────────────────────────────── second (optional)
  //             │ ┌────────────────────────────────────────────── minute
  //             │ │         ┌──────────────────────────────────── hour
  //             │ │         │                           ┌──────── day of month
  //             │ │         │                           │ ┌────── month
  //             │ │         │                           │ │ ┌──── day of week (0 is Sunday)
  //             │ │         │                           │ │ │
  //             │ │         │                           │ │ │
  //             S M         H                           D M W
  cron.schedule(`0 ${minute} ${hour} * * ${weekdays ? '1-5' : '*'}`, () => {
    logger.debug(`cron execute function at ${hour}:${minute}${weekdays ? ' on a weekday' : ''}`);
    fct();
  }, {timezone: 'Europe/Berlin'});
};

const blink = async function(gpio, count) {
  let state = 1;

  for(let i = 0; i < count; i += 0.5) {
    gpio.digitalWrite(state);

    await delay(ms('300ms'));

    state = state ? 0 : 1;
  }
};

const handleButton = async function(button, levelRaw) {
  const level = levelRaw ? 0 : 1;

  if(displayState) {
    logger.debug(`${button}: trigger`, {level});
    await mqttClient.publish(`control-io/${button}/STATE`, JSON.stringify(level), {retain: true});
  } else {
    logger.debug(`${button}: display on`);
    await mqttClient.publish('control-io/cmnd/display', '1', {retain: true});
  }
};

(async() => {
  // #########################################################################
  // Cleanup
  try {
    await fsPromises.access('/var/run/pigpio.pid', fs.constants.F_OK);
    logger.info('Cleanup pid file of previous run');
    await fsPromises.rm('/var/run/pigpio.pid');
  } catch{
    // File does not exist. Nothing to clean up. Fine.
  }

  // #########################################################################
  // Startup
  logger.info('Startup --------------------------------------------------');

  // #########################################################################
  // Init MQTT
  mqttClient = await mqtt.connectAsync('tcp://192.168.6.7:1883');

  // #########################################################################
  // Init gpio outputs

  // Display / GPIO 12
  const gpioDisplay = new Gpio(12, {mode: Gpio.OUTPUT});

  gpioDisplay.digitalWrite(displayState);
  await mqttClient.publish('control-io/display/STATE', '1', {retain: true});

  // Display Brightness, PWM, GPIO 18
  const gpioDisplayPWM = new Gpio(18, {mode: Gpio.OUTPUT});

  gpioDisplayPWM.pwmWrite(displayBrightness);
  await mqttClient.publish('control-io/brightness/STATE', JSON.stringify(displayBrightness), {retain: true});

  // Upper Button LED Red / GPIO 24
  const gpioLedRed = new Gpio(24, {mode: Gpio.OUTPUT});

  blink(gpioLedRed, 2);

  // Lower Button LED White / GPIO 23
  const gpioLedWhite = new Gpio(23, {mode: Gpio.OUTPUT});

  blink(gpioLedWhite, 2);

  // Beeper / GPIO 27
  const gpioBeeper = new Gpio(27, {mode: Gpio.OUTPUT});

  // ###########################################################################
  // Process handling

  const stopProcess = async function() {
    gpioDisplayPWM.pwmWrite(0);

    if(mqttClient) {
      await mqttClient.end();
      mqttClient = undefined;
    }

    logger.info('Shutdown -------------------------------------------------');

    process.exit(0);
  };

  // #########################################################################
  // Register MQTT events

  mqttClient.on('connect',    ()  => logger.info('mqtt.connect'));
  mqttClient.on('reconnect',  ()  => logger.info('mqtt.reconnect'));
  mqttClient.on('close',      ()  => _.noop() /* logger.info('mqtt.close') */);
  mqttClient.on('disconnect', ()  => logger.info('mqtt.disconnect'));
  mqttClient.on('offline',    ()  => logger.info('mqtt.offline'));
  mqttClient.on('error',      err => logger.info('mqtt.error', err));
  mqttClient.on('end',        ()  => _.noop() /* logger.info('mqtt.end') */);

  mqttClient.on('message', async(topic, messageBuffer) => {
    const messageRaw = messageBuffer.toString();

    try {
      let message;

      try {
        message = JSON.parse(messageRaw);
      } catch {
        // ignore
      }

      if(!topic.startsWith('control-io/cmnd/')) {
        logger.error(`Unhandled topic '${topic}'`, message);

        return;
      }

      const cmnd = topic.replace(/^control-io\/cmnd\//, '');

      logger.debug('MQTT received', {cmnd, message});

      if(cmnd === 'beep') {
        setTimeout(() => {
          gpioBeeper.digitalWrite(0);
        }, ms('100ms'));
        gpioBeeper.digitalWrite(1);
      } else
      if(cmnd === 'brightness') {
        if(_.isNumber(message)) {
          displayBrightness = message;
        } else {
          if(message === '-') {
            displayBrightness -= 10;
          } else if(message === '+') {
            displayBrightness += 10;
          }

          if(displayBrightness < 0) {
            displayBrightness = 0;
          } else if(displayBrightness > 190) {
            displayBrightness = 190;
          }
        }

        logger.info('PWM', displayBrightness);

        gpioDisplayPWM.pwmWrite(displayBrightness);
        await mqttClient.publish(`control-io/${cmnd}/STATE`, JSON.stringify(displayBrightness), {retain: true});
      } else {
        let   gpio;
        const state = message ? 1 : 0;

        switch(cmnd) {
          case 'display':
            gpio         = gpioDisplay;
            displayState = state;
            break;

          case 'ledRed':
            gpio = gpioLedRed;
            break;

          case 'ledWhite':
            gpio = gpioLedWhite;
            break;

          default:
            logger.error(`Unhandled cmnd '${cmnd}'`, message);
            break;
        }

        check.assert.nonEmptyObject(gpio, 'gpio missing');

        logger.debug('MQTT', {cmnd, state});

        gpio.digitalWrite(state);
        await mqttClient.publish(`control-io/${cmnd}/STATE`, JSON.stringify(state), {retain: true});
      }
    } catch(err) {
      logger.error(`Failed mqtt handling for '${topic}': ${messageRaw}`, err);
    }
  });

  await mqttClient.subscribe('control-io/cmnd/#');

  // #########################################################################
  // Init gpio inputs

  // Upper Button / GPIO 2
  const gpioButtonUpper = new Gpio(2, {
    mode:       Gpio.INPUT,
    pullUpDown: Gpio.PUD_UP,
    alert:      true,
  });

  gpioButtonUpper.glitchFilter(10); // for alert only

  gpioButtonUpper.on('alert', levelRaw => handleButton('buttonUpper', levelRaw));

  // Lower Button / GPIO 4
  const gpioButtonLower = new Gpio(4, {
    mode:       Gpio.INPUT,
    pullUpDown: Gpio.PUD_UP,
    alert:      true,
  });

  gpioButtonLower.glitchFilter(10); // for alert only

  gpioButtonLower.on('alert', levelRaw => handleButton('buttonLower', levelRaw));

  // #########################################################################
  // Shutdown handler
  process.on('SIGTERM', () => stopProcess());
})();
