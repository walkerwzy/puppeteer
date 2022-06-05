const fetch = require('node-fetch')
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36';

module.exports = (url, args = {}) => {
  args.headers = args.headers || {}
  args.headers['user-agent'] = ua
  return fetch(url, args)
}