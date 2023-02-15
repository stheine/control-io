#!/usr/bin/env node

import {setTimeout as delay} from 'timers/promises';
import fs                    from 'fs';
import fsPromises            from 'fs/promises';

import _                     from 'lodash';
import check                 from 'check-types-2';
import mqtt                  from 'async-mqtt';
import ms                    from 'ms';
import pigpio                from 'pigpio';

import logger                from './logger.js';

// ###########################################################################
// Globals

const {Gpio}            = pigpio;
let   displayState      = 1;
let   displayBrightness = 70;
let   mqttClient;

const blink = async function(gpio, count) {
  let state = 1;

  for(let i = 0; i < count; i += 0.5) {
    gpio.digitalWrite(state);

    await delay(ms('300ms'));

    state = state ? 0 : 1;
  }
};

const handleButton = async function(button, levelRaw) {
  if(displayState) {
    const level = levelRaw ? 0 : 1;

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
  } catch(err) {
    // File does not exist. Nothing to clean up. Fine.
  }

  // #########################################################################
  // Startup
  logger.info(`Startup --------------------------------------------------`);

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
  await mqttClient.publish(`control-io/brightness/STATE`, JSON.stringify(displayBrightness), {retain: true});

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

    logger.info(`Shutdown -------------------------------------------------`);

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

        logger.info('PWM', displayBrightness);

        gpioDisplayPWM.pwmWrite(displayBrightness);
        await mqttClient.publish(`control-io/${cmnd}/STATE`, JSON.stringify(displayBrightness), {retain: true});
      } else {
        let state = message ? 1 : 0;
        let gpio;

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

        // logger.debug('MQTT', {cmnd, state});

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

  process.on('SIGTERM', () => stopProcess());
})();
