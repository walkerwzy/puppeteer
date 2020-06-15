const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const url = require('url')
const pageurl = 'https://www.luoow.com/';
const page_start = 1;
const page_end = 999;
const filename = 'test.txt';
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36';

(async () => {
    try {
        // const handler = await fs.promises.open(filename, 'w');
        // await handler.writeFile('逍遥战神\n\n');
        // await handler.close();

        const browser = await puppeteer.launch({headless: true});
        const page = await browser.newPage();

        // Optimisation
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const rstype = req.resourceType();
            if (rstype in ['font', 'image', 'media', 'stylesheet']) req.abort();
            else req.continue();
        });
        page.on('response', async (res) => {
            const url_obj = url.parse(res.url()); //(res.request().url());
            if(url_obj.pathname == '/ajax' && /m=163music&c2/.test(url_obj.search)) {
                console.dir("parse", url_obj.path);
                console.log(await res.text()); 
                // get detail
                const data = await res.json();
                await Promise.all(
                    data.map(async d => {
                        const mp3_url = await get_detail(d.song_id);
                        // TODO: 发布前改为期数名文件夹, 暂时用temp做测试
                        await download(mp3_url, d.name, 'temp/')
                }));
            }
        });
        
        const get_detail = async (id) => {
            const detail_url = url.resolve(pageurl, `/ajax?m=163music_item&c2=${id}`);
            console.log("fetching", detail_url);
            // return fetch(detail_url)
            // .then(r=>r.json())
            // .then(console.log);
            const response = await fetch(detail_url);
            if (!response.ok) throw new Error(`unexpected response with ${detail_url}: ${response.statusText}`);
            return await(await response.json()).url;
        }

        const download = async (file_url, song_name, dest) => {
            if(!file_url) return Promise.resolve('empty');
            dest = path.resolve('temp/', `${song_name}${path.extname(file_url)}`);
            const response = await fetch(file_url);
            if (!response.ok) throw new Error(`unexpected response with ${file_url}: ${response.statusText}`);
            console.log(`writting file to ${dest}`);
            await pipeline(response.body, fs.createWriteStream(dest));
        }

        await page.setUserAgent(ua);
        const href = url.resolve(pageurl, `${page_start}`);
        console.log("visiting page:", href)
        await page.goto(href, {waitUntil: 'networkidle2'});

        await page.close();
        // debugger;
    } catch (error) {
        console.log("error:", error);
    }
})();

// async function getArticle(page) {
//     const title = await page.$eval('.chaptername', t => t.textContent);
//     let content = await page.$eval('#txt', c => c.textContent);
//     content = content.replace(/\s+/g, '\n')
//                     .replace(' ', '')
//                     .replace('『如果章节错误，点此举报』', '');
//     console.log("title", title);
//     // console.log("value:", content);
    
//     const stream = fs.createWriteStream(filename, {flags: 'a'});
//     stream.write(title);
//     stream.write('\n\n');
//     stream.write(content);
//     stream.write('\n\n');
//     stream.close();

//     if(await gotoNextPage(page) == 'EOF') {
//         await page.close();
//         console.log("-------DONE!---------")
//     }
// }

// async function gotoNextPage(page) {
//     const url = await page.$eval('.url_next', u => u['href']);
//     if(url.indexOf('50437927.html')>0) return Promise.resolve('EOF');
//     // await page.click('.url_next');
//     // await page.waitForNavigation({waitUntil: 'networkidle2'}); // timeout, why?
//     // await page.waitFor(1000);
//     await page.goto(url, {waitUntil: 'networkidle0'});
//     await getArticle(page);
// }