const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const url = require('url');
const pageurl = 'https://www.luoow.com/';
const tmp_dir = 'temp/';
const log_filename = 'test.txt';
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36';

const args = process.argv.slice(2);
const page_start = parseInt(args[0], 10) || 1;
const page_end = parseInt(args[1], 10) || page_start + 5;
let vol = `vol.${page_start}`;

const event = new EventEmitter();

(async () => {
    try {
        await fs.writeFile(log_filename, 'vol\tname\n');
        await fs.emptyDir(tmp_dir);

        const browser = await puppeteer.launch({headless: true});
        // for(let i = page_start; i <= page_end; i++) {
        //     vol = `vol.${i}`;
        //     await goto_page(browser, i);
        // }
        let pageindex = page_start;
        await goto_page(browser, pageindex++);

        event.on('finish', async () => {
            if(pageindex > page_end) {
                console.log(`=================${vol} done!=================`);
                return Promise.resolve();
            }
            await goto_page(browser, pageindex++);
        });
    } catch (error) {
        console.error("error propagation", error);
    }
})();

const sleep = ms => new Promise( resolve => setTimeout(resolve, ms));

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
                // praparing saving directory
                const dest_path = `${tmp_dir}/${vol}`;
                await fs.emptyDir(dest_path);
                for (const d of data) {
                    const mp3_url = await get_detail(d.song_id);
                    await download(mp3_url, d.name, dest_path); 
                };
                // 密集并行请求容易被服务器ban
                // await Promise.all(
                //     data.map(async d => {
                //         const mp3_url = await get_detail(d.song_id);
                //         if(mp3_url) await download(mp3_url, d.name, dest_path); 
                // }));
                await page.close();
                event.emit('finish');
            });
        }
    });

    await page.setUserAgent(ua);

    let href = url.resolve(pageurl, `${pageindex}`);
    await page.goto(href, {waitUntil: 'networkidle2'});
    vol = await page.$eval('div.title', t => t.textContent); // 默认值: vol.xxx, 先到为准
    event.emit('vol', vol);

    // await page.close();

}


// private method

/*
 * get file remote detail
 * @id int the id of the file
 * @count retry count
*/
const get_detail = async (id, count) => {
    count = count || 0;
    const detail_url = url.resolve(pageurl, `/ajax?m=163music_item&c2=${id}`);
    try {
        console.log("fetching", detail_url);
        const response = await fetch(detail_url);
        if (!response.ok) throw new Error(`unexpected response with ${detail_url}: ${response.statusText}`);
        return await(await response.json()).url;
    } catch (error) {
        // 最后一次才记录抓取失败
        if(count++ == 10) console.error(`fetch detail retry count (${count})\n`, error);
        // 最多重试10次，最长间隔15秒。
        if(count < 10) {
            await sleep(count * 1500);
            return await get_detail(id, count);
        } else return Promise.resolve();
    }
}

const download = async (file_url, song_name, dest) => {
    if(!file_url) {
        console.error("missing file meta:", vol, song_name);
        return await fs.appendFile(log_filename, `${vol}\t${song_name}\n`); // fs-extra使用了graceful-fs避免 EMFILE error
    }
    song_name = song_name.replace(/[<>:"/\|?*]/g, ''); // remove invalid characters on windows
    const file_dest = path.resolve(dest, `${song_name}${path.extname(file_url)}`);
    try {
        const response = await fetch(file_url);
        if (!response.ok) throw new Error(`unexpected response with ${file_url}: ${response.statusText}`);
        console.log(`writting file to ${file_dest}`);
        await pipeline(response.body, fs.createWriteStream(file_dest));   
    } catch (error) {
        console.error(error);
        return Promise.resolve();
    }
}