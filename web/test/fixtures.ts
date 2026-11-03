// Real Channel3 results captured on 2026-11-03. The Joy-Con search returned whole consoles next to
// the part, which once priced a cracked $50 Joy-Con at $304 and refunded $138 on a $230 deal.
const c = (title: string, dollars: number) => ({ id: title, title, priceCents: Math.round(dollars * 100) });

export const JOYCON_SEARCH = [
  c("Nintendo Switch Joy-Con (L)", 44.99),
  c("Switch OLED", 477),
  c("Nintendo Switch OLED Model", 444.99),
  c("Nintendo Switch Joy-Con (L)", 26.59),
  c("Switch – OLED Model", 449.99),
  c("Switch – OLED Model", 489.99),
  c("Nintendo Switch OLED Model", 343),
  c("Nintendo Switch Joy-Con (L) Wireless Controller", 26.59),
  c("Nintendo Switch OLED Console", 208.99),
  c("Nintendo Switch 2 Wireless Joy-Con Controller", 54.99),
  c("Nintendo Switch Joy-Con Controllers", 69.9),
  c("Nintendo Switch Joy-Con (L-R)", 80),
];

export const SCREEN_SEARCH = [
  c("iPhone 13 Screen Replacement", 20),
  c("Full Body Glass Screen Protector", 5),
  c("Qixxronics Glass Screen Protector for iPhone 13", 12.99),
  c("Tempered Glass Screen Protector for iPhone 13/13 Pro", 27.99),
  c("Privacy Screen Protector for iPhone 13/13 Pro 2-Pack", 24.58),
  c("iPhone 14 Pro Screen Replacement", 29.96),
];

export const SWITCH_SEARCH = [
  c("Switch OLED", 349.99),
  c("Nintendo Switch – OLED Model", 434),
  c("Dock - Oled Model", 49.99),
  c("Nintendo Switch OLED Model with White Joy-Con", 258),
  c("Protective Case for Switch OLED", 19.99),
];
