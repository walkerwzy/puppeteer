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
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36';

const args = process.argv.slice(2);
const page_start = parseInt(args[0], 10) || 1;
const page_end = Math.max(parseInt(args[1], 10) || page_start + 2, page_start+2);
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
    console.log(`===========page ${pageindex}==========`)
    const page = await browser.newPage();
    let data = [];
    
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
            data = await res.json();
            event.emit('vol_data');
        }
    });

    // 专辑数据来自xhr, 专辑标题来自页面, 两者加载完成顺序未知
    // 接收两个消息, 一旦两个条件满足则处理数据
    event.once('vol_title', async () => {
        if(!data) return Promise.resolve();
        await process_data();
    });
    event.once('vol_data', async () => {
        if(/^vol\.\d+$/ig.test(vol)) return Promise.resolve();
        await process_data();
    });

    const process_data = async () => {
        // preparing saving directory
        const dest_path = `${tmp_dir}/${vol}`;
        await fs.emptyDir(dest_path);
        // request by sequence
        for (const d of data) {
            const mp3_url = await get_detail(d.song_id);
            await download(mp3_url, d.name, dest_path); 
        };
        console.log(`=================${vol} done!=================\n`);
        await go_next_page();
        // parallel request my be ban by server
        // await Promise.all(
        //     data.map(async d => {
        //         const mp3_url = await get_detail(d.song_id);
        //         if(mp3_url) await download(mp3_url, d.name, dest_path); 
        // }));
        // event.emit('finish');
    }

    const go_next_page = async () => {
        if(++pageindex > page_end) {
            console.log(`=================【All done!】=================`);
            return await page.close();
        }
        vol = `vol.${pageindex}`;
        await goto_page(browser, pageindex);
    }

    await page.setUserAgent(ua);

    let href = url.resolve(pageurl, `${pageindex}`);
    await page.goto(href, {waitUntil: 'networkidle2'});
    vol = await page.$eval('div.title', t => t.textContent);
    event.emit('vol_title');
    

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