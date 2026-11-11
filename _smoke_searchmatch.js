// 拍照搜题烟测：题库匹配 matchQuestions + vision.build 挂载 + reportBlocks 渲染
const ROOT = 'D:/xiaochengxu2/signals-pro/';
const search = require(ROOT + 'utils/search');
const vision = require(ROOT + 'utils/vision');
const D = require(ROOT + 'data/index');

let fail = 0;
function ok(cond, msg, extra) {
  if (cond) console.log('  ✓ ' + msg + (extra === undefined ? '' : '  ' + extra));
  else { fail += 1; console.log('  ✗ ' + msg + (extra === undefined ? '' : '  ' + extra)); }
}

console.log('\n== matchQuestions 基础行为 ==');
ok(typeof search.matchQuestions === 'function', '导出 matchQuestions');
ok(search.matchQuestions('').length === 0, '空文字不匹配');
ok(search.matchQuestions('abc').length === 0, '过短文字不匹配');
ok(search.matchQuestions(null).length === 0, 'null 安全');

console.log('\n== 精确题干命中 ==');
const q1 = D.questions[0];
const hits1 = search.matchQuestions(q1.stem, 3);
ok(hits1.length > 0, '题库首题原干能命中', 'top=' + (hits1[0] && hits1[0].id));
ok(hits1[0].id === q1.id, 'top1 就是原题', hits1[0].id + ' vs ' + q1.id);
ok(hits1[0].score >= 0.8, '相似度 >= 80%', hits1[0].score);
ok(Array.isArray(hits1[0].options) && hits1[0].options.length === 4, '带 4 个选项');
ok(typeof hits1[0].answer === 'number', '带答案下标');
ok(!!hits1[0].explanation, '带解析');

console.log('\n== 题干 + 选项的整题文本 ==');
const q2 = D.questions[5] || D.questions[2];
const full = q2.stem + '\n' + q2.options.join('\n');
const hits2 = search.matchQuestions(full, 3);
ok(hits2.length > 0 && hits2[0].id === q2.id, '整题文本命中且排第一', hits2[0] && hits2[0].id);
ok(hits2[0].score >= 0.85, '整题相似度更高', hits2[0].score);

console.log('\n== OCR 噪声容错（错字 / 全角 / 空格） ==');
const noisy = q1.stem
  .replace(/信号/g, '信 号')
  .replace(/属于/g, '属 于') + '（拍照）';
const hits3 = search.matchQuestions(noisy, 3);
ok(hits3.length > 0 && hits3[0].id === q1.id, '加空格/全角括号后仍命中', hits3[0] && hits3[0].id);

console.log('\n== 不相关文字不乱命中 ==');
const noise = '今天天气不错我们去公园散步吧然后吃饭睡觉休息';
const hits4 = search.matchQuestions(noise, 3);
ok(hits4.length === 0, '闲聊文字零命中', 'len=' + hits4.length);

console.log('\n== limit 生效 ==');
const hits5 = search.matchQuestions(D.questions[10].stem + ' ' + D.questions[11].stem, 1);
ok(hits5.length <= 1, 'limit=1 最多返回 1 条', 'len=' + hits5.length);

console.log('\n== vision.build 挂载 matches ==');
const rep = vision.build(null, null, q1.stem);
ok(Array.isArray(rep.matches), 'build 返回 matches 数组');
ok(rep.matches.length > 0 && rep.matches[0].id === q1.id, 'build 里命中首题', rep.matches[0] && rep.matches[0].id);
const repEmpty = vision.build(null, null, '');
ok(Array.isArray(repEmpty.matches) && repEmpty.matches.length === 0, '无文字时 matches 为空');

console.log('\n== reportBlocks 渲染 ==');
const blocks = vision.reportBlocks(rep);
const texts = blocks.map((b) => b.text || '').join('\n');
ok(blocks.length > 0, 'blocks 非空', 'len=' + blocks.length);
ok(texts.indexOf('搜题结果') >= 0, '含搜题结果段');
ok(texts.indexOf('相似度') >= 0, '含相似度标注');
ok(texts.indexOf('答案：') >= 0, '含答案行');
ok(texts.indexOf(q1.stem.slice(0, 6)) >= 0, '含题干片段');
const repNo = vision.build(null, null, '今天天气不错我们去公园散步吧然后吃饭睡觉休息');
const blocksNo = vision.reportBlocks(repNo);
const textsNo = blocksNo.map((b) => b.text || '').join('\n');
ok(textsNo.indexOf('没命中内置题库') >= 0, '未命中时给明确提示');
ok(textsNo.indexOf('批改结论') >= 0, '批改结论仍在');

console.log('\n== 内置样例卷走通搜题+批改 ==');
const paper = vision.PAPERS[0];
const repP = vision.build(paper, null, paper.text);
ok(Array.isArray(repP.matches), '内置卷 build 也有 matches 字段');
const blocksP = vision.reportBlocks(repP);
ok(blocksP.map((b) => b.text || '').join('\n').indexOf('批改结论') >= 0, '内置卷报告含批改结论');

console.log(fail === 0 ? '\n拍照搜题烟测全绿 ✅' : '\n有 ' + fail + ' 条失败 ❌');
process.exit(fail === 0 ? 0 : 1);
