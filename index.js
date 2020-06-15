const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const url = require('url')
const pageurl = 'https://www.luoow.com/';
const page_start = 1;
const page_end = 3;
const tmp_dir = 'temp/';
const filename = 'test.txt';
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36';

const event = new EventEmitter();
let vol = `vol.${page_start}`;

(async () => {
    try {
        // const handler = await fs.promises.open(filename, 'w');
        // await handler.writeFile('逍遥战神\n\n');
        // await handler.close();

        await fs.emptyDir(tmp_dir);

        const browser = await puppeteer.launch({headless: true});
        for(let i = page_start; i <= page_end; i++) {
            vol = `vol.${i}`;
            await goto_page(browser, i);
        }
    } catch (error) {
        console.error("error propagation", error);
    }
})();

// const sleep = ms => new Promise( resolve => setTimeout(resolve, ms));

const goto_page = async (browser, pageindex) => {
    const page = await browser.newPage();

    // Optimisation
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const rstype = req.resourceType();
        if (rstype in ['font', 'image', 'media', 'stylesheet']) req.abort();
        else req.continue();
    });
    page.on('response', async (res) => {
        const url_obj = url.parse(res.url());
        if(url_obj.pathname == '/ajax' && /m=163music&c2/.test(url_obj.search)) {
            console.log("parse", url_obj.path);
            // console.log(await res.text()); 
            const data = await res.json();
            event.once('vol', async v => {
                await Promise.all(
                    data.map(async d => {
                        const mp3_url = await get_detail(d.song_id);
                        const dest_path = `${tmp_dir}/${vol}`;
                        await fs.emptyDir(dest_path);  // empty/create dir
                        await download(mp3_url, d.name, dest_path);   
                }));
                await page.close();
            });
        }
    });

    await page.setUserAgent(ua);

    let href = url.resolve(pageurl, `${pageindex}`);
    await page.goto(href, {waitUntil: 'networkidle2'});
    vol = await page.$eval('div.title', t => t.textContent); // 默认值: vol.xxx, 先到为准
    event.emit('vol', vol);
    console.log(`fetched 《${vol}》 ${href}`);

    // await page.close();

}


// private method

const get_detail = async (id) => {
    const detail_url = url.resolve(pageurl, `/ajax?m=163music_item&c2=${id}`);
    try {
        console.log("fetching", detail_url);
        const response = await fetch(detail_url);
        if (!response.ok) console.error(`unexpected response with ${detail_url}: ${response.statusText}`);
        try {
            return await(await response.json()).url;
        } catch (error) {
            const body = await response.body;
            console.error('parse json error', error, body);
        }
    } catch (error) {
        console.error(error);
    }
}

const download = async (file_url, song_name, dest) => {
    if(!file_url) {
        console.info("****empty meta:", song_name);
        return Promise.resolve('empty');
    }
    dest = path.resolve(dest, `${song_name}${path.extname(file_url)}`);
    try {
        const response = await fetch(file_url);
        if (!response.ok) cosole.error(`unexpected response with ${file_url}: ${response.statusText}`);
        console.log(`writting file to ${dest}`);
        await pipeline(response.body, fs.createWriteStream(dest));   
    } catch (error) {
        console.error(error);
    }
}