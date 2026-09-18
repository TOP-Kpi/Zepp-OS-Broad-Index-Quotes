const etfs = [
  ['510300', '沪深300ETF'],
  ['510500', '中证500ETF'],
  ['512100', '中证1000ETF'],
  ['515180', '中证红利ETF'],
  ['159915', '创业板ETF'],
  ['588000', '科创50ETF'],
]

function title(text) {
  return Text({ style: { fontSize: '20px', fontWeight: '600', marginTop: '20px', marginBottom: '8px', color: '#1d1d1f' } }, [text])
}

function note(text) {
  return Text({ paragraph: true, style: { fontSize: '13px', lineHeight: '19px', color: '#6e6e73', marginBottom: '12px' } }, [text])
}

AppSettingsPage({
  build() {
    const positionSections = etfs.map(([code, name]) =>
      Section({ style: { marginTop: '10px' } }, [
        Text({ bold: true, style: { fontSize: '16px', color: '#1d1d1f' } }, [`${name}  ${code}`]),
        Toggle({ label: '加入自选持仓', settingsKey: `position.${code}.enabled` }),
        TextInput({ label: '成本价', placeholder: '例如 4.126', settingsKey: `position.${code}.cost` }),
        TextInput({ label: '仓位（%）', placeholder: '例如 20', settingsKey: `position.${code}.weight` }),
      ]),
    )

    return Section({ style: { padding: '12px', background: '#f5f5f7' } }, [
      title('宽基指数行情 设置'),
      note('数据由 Zepp 手机端 Side Service 直接联网获取，再通过蓝牙同步到手表。电脑端不需要运行。'),

      title('手机直连'),
      Section({}, [
        Text({ style: { fontSize: '15px', color: '#1d1d1f', marginBottom: '8px' } }, ['模式：手机实时联网']),
        Text({ style: { fontSize: '15px', color: '#1d1d1f', marginBottom: '8px' } }, ['行情：东方财富公共行情接口']),
        Text({ style: { fontSize: '15px', color: '#1d1d1f', marginBottom: '8px' } }, ['刷新策略：60 秒（流畅优先）']),
      ]),
      note('手表页面优先显示最近缓存，随后静默同步；实时行情与分时数据最低每 60 秒刷新一次，减少蓝牙通信和手表主线程负担。手机需要联网并保持与手表蓝牙连接。'),

      title('显示与预警'),
      Section({}, [
        Select({
          label: '默认 ETF',
          settingsKey: 'display.primaryCode',
          options: etfs.map(([code, name]) => ({ name: `${name} ${code}`, value: code })),
          start: etfs.map(([code]) => code).indexOf('510300'),
        }),
        Toggle({ label: '启用信号通知与振动', settingsKey: 'alerts.enabled', value: true }),
        Toggle({ label: '跌破 5 日均线触发清仓预警', settingsKey: 'threshold.exitBelowMa5', value: true }),
        TextInput({ label: '买入最低评分（0-100）', placeholder: '75', settingsKey: 'threshold.buyScore' }),
        TextInput({ label: '低估分位阈值（%，0-100）', placeholder: '20', settingsKey: 'threshold.valuationPercentile' }),
      ]),
      note('默认 ETF 只能从 6 个核心标的中选择，填入其他代码不会生效。成本价、仓位、评分等数字项由手表端自动校验：非法值会按默认值处理（评分 75，分位 20）。PE 五年估值使用对应指数代码，历史 PE 数据源不可用时不会用 ETF 的 PE 冒充指数估值。'),

      title('支持设备'),
      Section({}, [
        Text({ style: { fontSize: '15px', color: '#1d1d1f', marginBottom: '6px' } }, ['方屏 390×450 · GTS 4 / Cheetah (Square) / Active / Active 2 (Square) / Bip 6 / Rome · 已支持']),
        Text({ style: { fontSize: '15px', color: '#1d1d1f', marginBottom: '6px' } }, ['方屏 432×514 · Bip Max · 已支持']),
        Text({ style: { fontSize: '15px', color: '#1d1d1f', marginBottom: '6px' } }, ['方屏 320×380 · Bip 5 / Bip 5 Core / Bip 5 Unity · 已支持']),
        Text({ style: { fontSize: '15px', color: '#1d1d1f', marginBottom: '6px' } }, ['圆屏 480×480 / 466×466 / 454×454 / 416×416 / 360×360 · 已支持']),
      ]),
      note('构建目标覆盖全部 Zepp OS 3.0 及以上版本的方屏与圆屏设备（含国行版本）。方屏沿用 390×450 版面，按当前屏幕反推安全边距与卡片宽度；圆屏按 390×390 内切圆弦宽收窄内容带。两种形状共用同一套页面代码，构建期各自分包。未包含 GTS 3、GTS 4 mini 等 Zepp OS 1.0 设备，以及 Bip 5 (API 2.1) 等低于运行版本要求的机型。'),

      title('自选与持仓'),
      note('启用 ETF 后填写成本价和仓位。手表会使用手机直连的最新价计算收益。'),
      ...positionSections,

      View({ style: { height: '36px' } }, []),
    ])
  },
})
