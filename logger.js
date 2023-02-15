/* eslint-disable no-console */

import dayjs from 'dayjs';

export default {
  debug(msg, params) {
    if(params) {
      console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} DEBUG`, msg, params);
    } else {
      console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} DEBUG`, msg);
    }
  },
  info(msg, params) {
    if(params) {
      console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} INFO`, msg, params);
    } else {
      console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} INFO`, msg);
    }
  },
  warn(msg, params) {
    if(params) {
      console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} WARN`, msg, params);
    } else {
      console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} WARN`, msg);
    }
  },
  error(msg, params) {
    if(params) {
      console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} ERROR`, msg, params);
    } else {
      console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} ERROR`, msg);
    }
  },
};
