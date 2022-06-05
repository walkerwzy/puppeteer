const puppeteer = require('puppeteer');
const fs = require('fs');
const { exception } = require('console');
// const firstpage = 'https://www.mingrenteahouse.com/shu/50437927/52863430.html';
const firstpage = 'https://api.zhihu.com/remix/well/1230855946576531456/catalog?limit=20&offset=0';
const filename = '拨开历史的迷雾.txt';
const cookies = require('./cookies.json');
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36';

(async () => {
    try {
        const handler = await fs.promises.open(filename, 'w');
        await handler.writeFile('拨开历史迷雾：那些人那些事为何被后人铭记\n\n');
        await handler.close();
        const browser = await puppeteer.launch({headless: true});
        const page = await browser.newPage();
        // page.evaluateOnNewDocument(()=>{
        //     document.cookie = '_xsrf=xAk9NHDNWwrFl2ks0FSdCB3nnma2M4bg; _zap=402ddc68-0f86-457d-98ae-0e688161ff9e; __gads=ID=9faed7b6432cb0d3:T=1554219991:S=ALNI_MZTvh9pRB2RvtEBIbez_H316g2tTQ; d_c0="ABCtlRUMQxCPTtxPOp6j1-b_5JS3teKDkmI=|1572157368"; __utma=51854390.748330427.1582616880.1582616880.1582616880.1; __utmv=51854390.100-1|2=registration_date=20110530=1^3=entry_date=20110530=1; _ga=GA1.2.748330427.1582616880; z_c0="2|1:0|10:1586181688|4:z_c0|92:Mi4xSkpFQUFBQUFBQUFBRUsyVkZReERFQ1lBQUFCZ0FsVk5PSVI0WHdDM2l1cDI1VG9vWG9PU0FjOW8zdC1GMm9vTzdR|89d956c0a415c795ca217965c00ccd1a80bc5934d4b9fc7b19aa432a4d60b6b9"; q_c1=da0dae8b5b5c48f89e9df10d6641328a|1600233293000|1477544367000; tst=r; _gid=GA1.2.239747655.1601018573; Hm_lvt_98beee57fd2ef70ccdd5ca52b9740c49=1601018253,1601018568,1601018715,1601018718; SESSIONID=CVmOxzErKo0GWAXQeBTJg2zSWrxQ3zR7xWWQ8FQJisu; JOID=UVEdAk39AICmZDF_Y__vVrcQeuJ5tFfk7hlBOxizZbHoNHUtM4GT4_trOndtjAaxSkQORY1vBfEBTNQoOJWGNmE=; osd=UFkcA0v8CIGnYjB3Yv7pV78Re-R4vFbl6BhJOhm1ZLnpNXMsO4CS5fpjO3ZrjQ6wS0IPTYxuA_AJTdUuOZ2HN2c=; Hm_lpvt_98beee57fd2ef70ccdd5ca52b9740c49=1601019032; KLBRSID=d1f07ca9b929274b65d830a00cbd719a|1601039476|1601034665';
        // });
        page.setCookie(...cookies);

        // Optimisation
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const rstype = req.resourceType();
            if (rstype in ['font', 'image', 'media', 'stylesheet']) req.abort();
            else req.continue();
        });

        await page.setUserAgent(ua);
        await page.goto(firstpage, {waitUntil: 'networkidle0'});
        await startProcess(page);
        // debugger;
    } catch (error) {
        console.log("error:", error);
    }
})();

async function startProcess(page) {
    // method 1, evaluate the "body" of response
    const data = await page.$eval('body', c => JSON.parse(c.textContent).data);
    // method 2, get the raw response
    // const json = await page.content();
    for (const el of data) {
        const url = `https://www.zhihu.com/market/paid_column/1230855946576531456/section/${el.id}`;
        const title1 = el.title;
        console.log('fetching', title1, url);
        await page.goto(url, {waitUntil: 'networkidle2'});
        const title = await page.$eval('h1', e => e.textContent);
        const content = await page.$eval('#manuscript', e => e.innerHTML);
        if(title1 !== title) throw new Error(`标题不匹配, ${title1}, ${title}`);

        //  排版
        const article = content.replace(/<blockquote>/ig, '>')
                        .replace(/<\/blockquote>/ig, '\n\n')
                        .replace(/<h1.*?>/ig, '##')
                        .replace(/<h2.*?>/ig, '###')
                        .replace(/<\/h1>/ig, '\n')
                        .replace(/<\/h2>/ig, '\n')
                        .replace(/\<\/p\>/ig, '\n')
                        .replace(/<li>/ig, '\n')
                        .replace(/<br\/?>/, '\n')
                        .replace(/<.*?>/g, '')
                        .replace(/&nbsp;/ig, '');

        // write to file
        const stream = fs.createWriteStream(filename, {flags: 'a'});
        stream.write(`#${title}`);
        stream.write('\n');
        stream.write(article);
        stream.write('\n');
        stream.close();
    }
    console.log("-------DONE-----")
    page.close();
}