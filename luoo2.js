const puppeteer = require('puppeteer');
// const fetch = require('node-fetch');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const url = require('url');
const pageurl = 'https://www.luoow.com/';
const media_host = 'https://luoow.wxwenku.com/';
const tmp_dir = 'temp/';
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36';

const args = process.argv.slice(2);
const page_start = parseInt(args[0], 10) || 1;          // default from page 1
const page_end = parseInt(args[1], 10) || page_start;   // default process 1 page
const log_filename = `missing_${page_start}_${page_end}.txt`;
let vol = `vol.${page_start}`;

const event = new EventEmitter();

(async () => {
    try {
        await fs.writeFile(log_filename, 'vol\tname\n');
        await fs.emptyDir(tmp_dir);

        const browser = await puppeteer.launch({headless: true});
        await goto_page(browser, page_start);

    } catch (error) {
        console.error("error propagation", error);
    }
})();

const sleep = ms => new Promise( resolve => setTimeout(resolve, ms));

const goto_page = async (browser, pageindex) => {
    const page = await browser.newPage();
    let data = [];
    
    // Optimisation
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const rstype = req.resourceType();
        // if (rstype in ['font', 'image', 'media', 'stylesheet']) req.abort();
        if (rstype in ['font', 'image', 'stylesheet']) req.abort();
        else req.continue();
    });
    page.on('response', async (res) => {
        // const url_obj = url.parse(res.url());
        // if(url_obj.pathname == '/ajax' && /m=163music&c2/.test(url_obj.search)) {
        //     console.log("parse", url_obj.path);
        //     // console.log(await res.text()); 
        //     data = await res.json();
        //     event.emit('vol_data');
        // }
    });
    page.on('console', async msg => {
  // serialize my args the way I want
  const args = await Promise.all(msg.args().map(arg => arg.executionContext().evaluate(arg => {
    // I'm in a page context now. If my arg is an error - get me its message.
    if (arg instanceof Error)
      return arg.message;
    // return arg right away. since we use `executionContext.evaluate`, it'll return JSON value of
    // the argument if possible, or `undefined` if it fails to stringify it.
    return arg;
  }, arg)));
  console.log('PAGE LOG:', msg.text(), ...args);
});

    const go_next_page = async () => {
        if(++pageindex > page_end) {
            console.log(`=================【All done!】=================`);
            return Promise.resolve();
        }
        vol = `vol.${pageindex}`;
        await goto_page(browser, pageindex);
    }

    await page.setUserAgent(ua);

    let href = url.resolve(pageurl, `${pageindex}`);
    console.log(`requesting ${href}`);
    await page.goto(href, {waitUntil: 'networkidle2'});
    // title
    vol = await page.$eval('div.title', t => t.textContent);
    vol = vol.replace(/[<>:"/\|?*]/g, '');
    vol = vol.replace(/\.$/,''); // 最后一个字符是.时， windows下打不开
    // event.emit('vol_title');
    console.log(vol);

    // data
    let song_names = await page.$$eval('span.skPlayer-list-name', n => n.map(m => m.textContent));
    let song_authors = await page.$$eval('span.skPlayer-list-author', a => a.map(m => m.textContent));
    // console.log("names", song_names);
    // console.log("song_authors", song_authors);
    if(song_names.length != song_authors.length) return console.log(`第${pageindex}期解析歌名，歌手数目不同`);
    
    // process
    const dest_path = `${tmp_dir}/${vol}`;
    await fs.emptyDir(dest_path);
    for (var i = song_names.length - 1; i >= 0; i--) {
    	let name = song_names[i].replace(/\s+/g, '_');
    	let author = song_authors[i].replace(/\s+/g, '_');
    	let mp3_url = url.resolve(media_host, `${page_start}/${name}_${author}.mp3`);
    	await download2(mp3_url, name, dest_path); 
    	
    	// let song_name = name.replace(/[<>:"/\|?*.]/g, '');
    	// let dest = path.resolve(dest_path, `${song_name}.mp3`)
    	// let body = await page.evaluate(download2, mp3_url);
    	// console.log(`writting file to ${dest}`);
    	// console.log('content:', body);
     //    await pipeline(body, fs.createWriteStream(dest)); 
        // const ab = await response.arrayBuffer();
        // await fs.writeFile(file_dest.toString(), Buffer.from(ab));
        // console.log(`《${song_name}》 saved successfully.`)	
    }

    await page.close(); // no more webpage use
    console.log(`=================${vol} done!=================\n`);
    await go_next_page();
}


// private method

const download2 = async (file_url, song_name, dest) => {
    try {
    	console.log(`fetching ${file_url}`)
	    song_name = song_name.replace(/[<>:"/\|?*.]/g, ''); // remove invalid characters on windows
	    const file_dest = path.resolve(dest, `${song_name}${path.extname(file_url)}`);
        const response = await fetch(file_url, {
        	method: 'GET',
        	headers: {
        		'User-Agent':ua
			},
			referer: 'https://www.luoow.com/',
			refererPolicy: 'unsafe-url', //'strict-origin-when-cross-origin',
			mode: 'cors'
        });
        if (!response.ok) throw new Error(`unexpected response with ${file_url}: ${response.statusText}`);
        console.log(`writting file to ${file_dest}`);
        await pipeline(response.body, fs.createWriteStream(file_dest)); 
        // const ab = await response.arrayBuffer();
        // await fs.writeFile(file_dest.toString(), Buffer.from(ab));
        console.log(`《${song_name}》 saved successfully.`)
    } catch (error) {
        console.error('FETCH ERROR:', error);
        return Promise.resolve();
    }
}