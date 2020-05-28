const puppeteer = require('puppeteer');
const fs = require('fs');
const firstpage = 'https://www.mingrenteahouse.com/shu/50437927/52863430.html';
const filename = 'text.txt';
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36';

(async () => {
    try {
        const handler = await fs.promises.open(filename, 'w');
        await handler.writeFile('逍遥战神\n\n');
        await handler.close();
        const browser = await puppeteer.launch({headless: true});
        const page = await browser.newPage();
        await page.setUserAgent(ua);
        await page.goto(firstpage, {waitUntil: 'networkidle0'});
        await getArticle(page);
        // debugger;
    } catch (error) {
        console.log("error:", error);
    }
})();

async function getArticle(page) {
    const title = await page.$eval('.chaptername', t => t.textContent);
    let content = await page.$eval('#txt', c => c.textContent);
    content = content.replace(/\s+/g, '\n')
                    .replace(' ', '')
                    .replace('『如果章节错误，点此举报』', '');
    console.log("title", title);
    // console.log("value:", content);
    
    const stream = fs.createWriteStream(filename, {flags: 'a'});
    stream.write(title);
    stream.write('\n\n');
    stream.write(content);
    stream.write('\n\n');
    stream.close();

    if(await gotoNextPage(page) == 'EOF') {
        await page.close();
        console.log("-------DONE!---------")
    }
}

async function gotoNextPage(page) {
    const url = await page.$eval('.url_next', u => u['href']);
    if(url.indexOf('50437927.html')>0) return Promise.resolve('EOF');
    // await page.click('.url_next');
    // await page.waitForNavigation({waitUntil: 'networkidle0'}); // timeout, why?
    await page.goto(url, {waitUntil: 'networkidle0'});
    await getArticle(page);
}