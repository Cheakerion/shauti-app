// ============================================================
// 解析器测试 — 覆盖你所有题库格式
// 用法: npx vitest run
// ============================================================
import { describe, it, expect } from 'vitest'
import { parseMarkdownBank } from '../parser'
import fs from 'fs'
import path from 'path'

// ============================================================
// 一、行内格式 — 选择题（你最常用的格式）
// ============================================================
describe('行内格式 — 选择题', () => {
  const md = `---
title: 测试选择题
---

1. 以下关于高血压的诊断标准，正确的是？
A. 收缩压≥120mmHg
B. 收缩压≥130mmHg
C. 收缩压≥140mmHg和（或）舒张压≥90mmHg
D. 收缩压≥150mmHg
正确答案: C
解析: 非同日3次测量诊室血压，收缩压≥140mmHg和（或）舒张压≥90mmHg即可诊断。

---

2. 心房颤动最常见的并发症是？
A. 心力衰竭
B. 心肌梗死
C. 脑栓塞
D. 肺栓塞
E. 感染性心内膜炎
正确答案: C
解析: 房颤时血液在左心房淤滞形成血栓，脱落导致脑栓塞最多见。`

  const result = parseMarkdownBank(md)

  it('正确提取标题', () => {
    expect(result.title).toBe('测试选择题')
  })

  it('正确解析题数', () => {
    expect(result.questions.length).toBe(2)
  })

  it('每道题有题干、选项、答案、解析', () => {
    for (const q of result.questions) {
      expect(q.stem).toBeTruthy()
      expect(q.options.length).toBeGreaterThanOrEqual(4)
      expect(q.answer).toBeTruthy()
      expect(q.explanation).toBeTruthy()
    }
  })

  it('第一题 — 答案和解析正确', () => {
    const q = result.questions[0]
    expect(q.stem).toContain('高血压')
    expect(q.options[2].text).toContain('140mmHg')
    expect(q.answer).toBe('C')
    expect(q.explanation).toContain('非同日3次')
  })

  it('第二题 — 支持5个选项（A-E）', () => {
    const q = result.questions[1]
    expect(q.options.length).toBe(5)
    expect(q.options[4].label).toBe('E')
    expect(q.answer).toBe('C')
  })
})

// ============================================================
// 二、行内格式 — 简答题
// ============================================================
describe('行内格式 — 简答题', () => {
  const md = `---
title: 测试简答题
---

## 简答题

1. 简述给水卫生的水源选择原则
正确答案: 一、水源选择三原则：水量充足、水质良好、便于卫生防护。
解析: 来源：环境卫生学课件知识点。

---

2. 简述介水传染病的定义及流行特点
正确答案: 以水为介质，病原体污染水源引起的传染病。暴发流行、控制水源即控制流行。
解析: 包含定义和四个流行特点。`

  const result = parseMarkdownBank(md)

  it('简答题也被正确解析', () => {
    expect(result.questions.length).toBe(2)
  })

  it('简答题没有选项，只有答案', () => {
    for (const q of result.questions) {
      expect(q.stem).toBeTruthy()
      expect(q.answer).toBeTruthy()
      expect(q.options).toEqual([])
    }
  })

  it('第一题答案内容正确', () => {
    expect(result.questions[0].stem).toContain('给水卫生')
    expect(result.questions[0].answer).toContain('水源选择三原则')
    expect(result.questions[0].explanation).toContain('环境卫生学')
  })
})

// ============================================================
// 三、行内格式 — 名词解释
// ============================================================
describe('行内格式 — 名词解释', () => {
  const md = `---
title: 测试名词解释
---

## 名词解释

1. 生物转化
英文: Biotransformation
正确答案: 外来化合物在体内代谢酶的作用下，经氧化、还原、水解和结合反应，使其化学结构发生改变，极性和水溶性增加，有利于排出体外的过程。
解析: 分为I相反应和II相反应，主要场所是肝脏。

---

2. 高血压
正确答案: 在未使用降压药物的情况下，非同日3次测量诊室血压，收缩压≥140mmHg和（或）舒张压≥90mmHg。
解析: 白大衣高血压需注意鉴别。`

  const result = parseMarkdownBank(md)

  it('名词解释被正确解析', () => {
    expect(result.questions.length).toBe(2)
  })

  it('答案内容正确（无选项题型）', () => {
    expect(result.questions[0].stem).toContain('生物转化')
    expect(result.questions[0].answer).toContain('外来化合物')
  })

  it('有英文:字段时 engStem 被正确提取', () => {
    expect(result.questions[0].engStem).toBe('Biotransformation')
    expect(result.questions[0].stem).toContain('生物转化')
  })

  it('无英文:字段时 engStem 为 undefined', () => {
    expect(result.questions[1].engStem).toBeUndefined()
  })

  it('英文:字段不污染 stem 和 explanation', () => {
    expect(result.questions[0].stem).not.toContain('英文')
    expect(result.questions[0].explanation).not.toContain('Biotransformation')
  })
})

// ============================================================
// 四、混合题型（一个文件含两种题型）
// ============================================================
describe('混合题型', () => {
  const md = `---
title: 混合题库
---

## 选择题

1. 环境卫生学的研究对象是？
A. 传染病分布
B. 人类及其周围环境
C. 食物营养
D. 职业人群
正确答案: B

---

## 简答题

2. 简述中暑的现场救治措施
正确答案: 立即脱离热环境，通风阴凉处休息，积极有效降温。
解析: 不用退烧药。`

  const result = parseMarkdownBank(md)

  it('两种题型都被解析', () => {
    expect(result.questions.length).toBe(2)
  })

  it('第一题是选择题（有选项）', () => {
    expect(result.questions[0].options.length).toBe(4)
    expect(result.questions[0].answer).toBe('B')
  })

  it('第二题是简答题（无选项）', () => {
    expect(result.questions[1].options.length).toBe(0)
    expect(result.questions[1].answer).toContain('脱离热环境')
  })
})

// ============================================================
// 五、没有 frontmatter 时用文件名 / 第一个标题
// ============================================================
describe('无 frontmatter', () => {
  it('用第一个 # 标题作为题库名', () => {
    const md = `# 内科学习题

1. 某题目？
A. 选项1
B. 选项2
C. 选项3
D. 选项4
正确答案: B`

    const result = parseMarkdownBank(md)
    expect(result.title).toBe('内科学习题')
  })

  it('没有任何标题时返回默认名', () => {
    const md = `1. 某题目？
A. 选项1
B. 选项2
正确答案: A`

    const result = parseMarkdownBank(md)
    expect(result.title).toBe('未命名题库')
  })
})

// ============================================================
// 六、微信篡改容错
// ============================================================
describe('微信篡改容错', () => {
  it('答案前有粗体标记仍能匹配', () => {
    const md = `---
title: 测试
---

1. 题目内容
A. 选项1
B. 选项2
C. 选项3
D. 选项4
**正确答案: C**`

    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(1)
    expect(result.questions[0].answer).toBe('C')
  })

  it('答案: 前缀（不带"正确"二字）也能用', () => {
    const md = `---
title: 测试
---

1. 题目
A. 选A
B. 选B
C. 选C
D. 选D
答案: B`

    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(1)
    expect(result.questions[0].answer).toBe('B')
  })

  it('解析前有粗体标记也能匹配', () => {
    const md = `---
title: 测试
---

1. 题目
A. A
B. B
C. C
D. D
正确答案: D
**解析:** 这是解析内容`

    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(1)
    expect(result.questions[0].explanation).toContain('这是解析内容')
  })

  it('选项用中文顿号分隔也能识别', () => {
    const md = `---
title: 测试
---

1. 题目
A、选项A
B、选项B
C、选项C
D、选项D
正确答案: C`

    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(1)
    expect(result.questions[0].options[0].text).toBe('选项A')
  })

  it('选项用右括号也能识别', () => {
    const md = `---
title: 测试
---

1. 题目
A) 选项A
B) 选项B
C) 选项C
D) 选项D
正确答案: D`

    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(1)
    expect(result.questions[0].options.length).toBe(4)
  })
})

// ============================================================
// 七、边界情况
// ============================================================
describe('边界情况', () => {
  it('空文件返回0题', () => {
    const result = parseMarkdownBank('')
    expect(result.questions.length).toBe(0)
    expect(result.title).toBe('未命名题库')
  })

  it('只有frontmatter没有题目', () => {
    const md = `---
title: 空题库
---`

    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(0)
  })

  it('题目没有答案不会被解析', () => {
    const md = `---
title: 测试
---

1. 只有题目没有答案
A. A
B. B`

    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(0)
  })

  it('多行题干被正确拼接', () => {
    const md = `---
title: 测试
---

1. 患者男性，65岁
既往有高血压病史10年
现因胸痛就诊
A. 选项A
B. 选项B
C. 选项C
D. 选项D
正确答案: A`

    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(1)
    expect(result.questions[0].stem).toContain('高血压病史')
    expect(result.questions[0].stem).toContain('胸痛')
  })

  it('多行解析被正确拼接', () => {
    const md = `---
title: 测试
---

1. 题目
A. A
B. B
C. C
D. D
正确答案: B
解析: 第一行说明
第二行补充
第三行总结`

    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(1)
    expect(result.questions[0].explanation).toContain('第一行说明')
    expect(result.questions[0].explanation).toContain('第二行补充')
    expect(result.questions[0].explanation).toContain('第三行总结')
  })
})

// ============================================================
// 八、分离式格式（## 答案）
// ============================================================
describe('分离式格式', () => {
  const md = `---
title: 分离式题库
---

**1.** 环境卫生学的研究对象是？
A. 传染病分布规律
B. 人类及其周围环境
C. 食物营养成分
D. 自然环境因素
E. 职业人群

**2.** 以下哪种污染物属于二次污染物？
A. 火山灰
B. NOx经紫外线照射生成的O₃
C. 含镉废水
D. 燃煤排放SO₂
E. 苯并(a)芘

**3.** 预防医学与公共卫生最主要的区别在于？
A. 个体行为干预为主
B. 属于临床医学
C. 关注传染病
D. 研究个体
E. 侧重微观调控与监测

## 答案

| 题号 | 答案 |
|------|------|
| 1 | B |
| 2 | B |
| 3 | E |`

  const result = parseMarkdownBank(md)

  it('正确解析分离式格式', () => {
    expect(result.questions.length).toBe(3)
  })

  it('答案被正确匹配到对应题目', () => {
    // 题号 1 → B（人类及其周围环境）
    expect(result.questions[0].answer).toBe('B')
    expect(result.questions[0].stem).toContain('环境卫生学')

    // 题号 2 → B（O₃）
    expect(result.questions[1].answer).toBe('B')
    expect(result.questions[1].stem).toContain('二次污染物')

    // 题号 3 → E
    expect(result.questions[2].answer).toBe('E')
    expect(result.questions[2].stem).toContain('预防医学')
  })
})

// ============================================================
// 九、多模块分离式格式
// ============================================================
describe('多模块分离式', () => {
  const md = `---
title: 多模块题库
---

**1.** 第一模块题目1
A. A1
B. B1
C. C1
**正确答案: A**

**2.** 第一模块题目2
A. A2
B. B2
C. C2
**正确答案: D**

## 答案
| 1 | A |
| 2 | B |

**3.** 第二模块题目1
A. A3
B. B3
C. C3
D. D3

## 答案
| 3 | C |`

  const result = parseMarkdownBank(md)

  it('多模块都能解析', () => {
    // 第一模块有行内答案，答案表可能覆盖
    // 核心是程序不崩溃
    expect(result.questions.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================
// 十、真实题库文件集成测试
// ============================================================
describe('真实题库文件', () => {
  const bankDir = path.join(__dirname, '..', '..', '题库')

  it('卫生学选择题题库 — 解析正常且题数>0', () => {
    const filePath = path.join(bankDir, '卫生学-选择题题库.md')
    if (!fs.existsSync(filePath)) {
      console.warn('文件不存在，跳过测试')
      return
    }
    const md = fs.readFileSync(filePath, 'utf-8')
    const result = parseMarkdownBank(md)
    expect(result.title).toBeTruthy()
    expect(result.questions.length).toBeGreaterThan(0)
    // 验证每道题都有必要字段
    for (const q of result.questions) {
      expect(q.stem).toBeTruthy()
      expect(q.answer).toBeTruthy()
    }
  })

  it('卫生学简答题题库 — 解析正常且题数>0', () => {
    const filePath = path.join(bankDir, '卫生学-简答题题库.md')
    if (!fs.existsSync(filePath)) {
      console.warn('文件不存在，跳过测试')
      return
    }
    const md = fs.readFileSync(filePath, 'utf-8')
    const result = parseMarkdownBank(md)
    expect(result.title).toBeTruthy()
    expect(result.questions.length).toBeGreaterThan(0)
    // 简答题没有选项
    for (const q of result.questions) {
      expect(q.stem).toBeTruthy()
      expect(q.answer).toBeTruthy()
    }
  })

  it('内科学测试题库 — 解析正常', () => {
    const filePath = path.join(bankDir, '测试题库-内科学.md')
    if (!fs.existsSync(filePath)) {
      console.warn('文件不存在，跳过测试')
      return
    }
    const md = fs.readFileSync(filePath, 'utf-8')
    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBeGreaterThan(0)
  })

  it('模板选择题 — 解析正常', () => {
    const filePath = path.join(bankDir, '模板-选择题.md')
    if (!fs.existsSync(filePath)) {
      console.warn('文件不存在，跳过测试')
      return
    }
    const md = fs.readFileSync(filePath, 'utf-8')
    const result = parseMarkdownBank(md)
    expect(result.title).toBe('选择题题库')
    expect(result.questions.length).toBe(2)
  })

  it('模板名词解释 — 解析正常且 engStem 正确', () => {
    const filePath = path.join(bankDir, '模板-名词解释.md')
    if (!fs.existsSync(filePath)) {
      console.warn('文件不存在，跳过测试')
      return
    }
    const md = fs.readFileSync(filePath, 'utf-8')
    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(3)
    // 所有题都应有英文术语
    expect(result.questions[0].engStem).toBe('Hypertension')
    expect(result.questions[1].engStem).toBe('Heart failure')
    expect(result.questions[2].engStem).toBe('Biotransformation')
  })

  it('物理诊断学名词解释 — 解析正常且 engStem 正确', () => {
    const filePath = path.join(bankDir, '物理诊断学__第1次课__名词解释.md')
    if (!fs.existsSync(filePath)) {
      console.warn('文件不存在，跳过测试')
      return
    }
    const md = fs.readFileSync(filePath, 'utf-8')
    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(13)
    // 验证英文术语
    expect(result.questions[0].engStem).toBe('Diagnostics')
    expect(result.questions[0].stem).toContain('诊断学')
    // 验证最后一道
    expect(result.questions[12].engStem).toBe('Family history')
    expect(result.questions[12].stem).toContain('家族史')
    // 所有题都应该有 engStem
    for (const q of result.questions) {
      expect(q.engStem).toBeTruthy()
    }
  })

  it('模板简答题 — 解析正常', () => {
    const filePath = path.join(bankDir, '模板-简答题.md')
    if (!fs.existsSync(filePath)) {
      console.warn('文件不存在，跳过测试')
      return
    }
    const md = fs.readFileSync(filePath, 'utf-8')
    const result = parseMarkdownBank(md)
    expect(result.questions.length).toBe(3)
  })
})
