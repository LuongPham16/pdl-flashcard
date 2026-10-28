/** Learning statistics dashboard dialog. */
import { Modal, setIcon } from "obsidian";
import { dateKey, formatCount } from "../utils.js";
import { DAY } from "../constants.js";
import { L, locale } from "../i18n.js";
import { FlashcardEditModal } from "./edit.js";

class FlashcardStatisticsModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; this.cards = []; this.range = 30; }

  async onOpen() {
    this.modalEl.addClass("pdl-stats-modal");
    this.contentEl.createDiv({ cls: "pdl-stats-loading", text: L("Calculating learning statistics…", "Đang tính thống kê học tập…") });
    this.cards = await this.plugin.getCards();
    this.render();
  }

  getData() {
    const now = Date.now(), schedule = this.plugin.settings.schedule || {}, reviews = this.plugin.settings.reviews || [];
    const ids = new Set(this.cards.map(card => card.id));
    const knownReviews = reviews.filter(review => ids.has(review.cardId));
    const recentStart = now - this.range * DAY;
    const recent = knownReviews.filter(review => review.at >= recentStart);
    const due = this.cards.filter(card => this.plugin.isCardAvailable(card, now) && (!schedule[card.id] || schedule[card.id].due <= now)).length;
    const newCards = this.cards.filter(card => !schedule[card.id]).length;
    const mature = this.cards.filter(card => (schedule[card.id]?.interval || 0) >= 21 && !schedule[card.id]?.suspended).length;
    const suspended = this.cards.filter(card => schedule[card.id]?.suspended).length;
    const successful = recent.filter(review => review.grade >= 2).length;
    const retention = recent.length ? Math.round(successful / recent.length * 100) : 0;
    const uniqueReviewed = new Set(knownReviews.map(review => review.cardId)).size;
    const days = [];
    for (let i = this.range - 1; i >= 0; i--) {
      const date = new Date(now); date.setHours(0,0,0,0); date.setDate(date.getDate() - i);
      const key = dateKey(date.getTime());
      days.push({ key, label: new Intl.DateTimeFormat(locale(), { month:"short", day:"numeric" }).format(date), count: recent.filter(review => dateKey(review.at) === key).length });
    }
    const ratings = [1,2,3,4].map(grade => ({ grade, count: recent.filter(review => review.grade === grade).length }));
    const decks = new Map();
    this.cards.forEach(card => {
      if (!decks.has(card.file.path)) decks.set(card.file.path, { title:card.deckTitle, source:card.sourceFile?.basename || card.sourcePath || L("Missing source", "Thiếu note nguồn"), cards:[], reviews:0 });
      decks.get(card.file.path).cards.push(card);
    });
    const cardById = new Map(this.cards.map(card => [card.id, card]));
    knownReviews.forEach(review => { const card=cardById.get(review.cardId); if(card&&decks.has(card.file.path)) decks.get(card.file.path).reviews++; });
    const deckRows = [...decks.values()]
      .map(deck => ({ ...deck, due:deck.cards.filter(card=>!schedule[card.id]||schedule[card.id].due<=now).length, mature:deck.cards.filter(card=>(schedule[card.id]?.interval||0)>=21).length }))
      .sort((a,b)=>b.due-a.due||b.cards.length-a.cards.length)
      .slice(0,12);
    const difficult = this.cards.map(card => ({ card, lapses:schedule[card.id]?.lapses||0, reps:schedule[card.id]?.reps||0 })).filter(item=>item.lapses>0).sort((a,b)=>b.lapses-a.lapses||b.reps-a.reps).slice(0,8);
    return { knownReviews, recent, due, newCards, mature, suspended, retention, uniqueReviewed, days, ratings, deckRows, difficult };
  }

  render() {
    const root=this.contentEl; root.empty(); const data=this.getData();
    const head=root.createDiv({cls:"pdl-stats-head"}); const copy=head.createDiv();
    copy.createSpan({text:L("LEARNING INTELLIGENCE", "TRÍ TUỆ HỌC TẬP")});
    copy.createEl("h2",{text:L("Statistics Dashboard", "Bảng thống kê")});
    copy.createEl("p",{text:L("Workload, retention, activity, and card quality across your entire library.", "Khối lượng, độ ghi nhớ, hoạt động và chất lượng thẻ trong toàn thư viện.")});
    const ranges=head.createDiv({cls:"pdl-stats-ranges",attr:{role:"group","aria-label":L("Statistics time range", "Khoảng thời gian thống kê")}});
    [14,30,90].forEach(days=>{const button=ranges.createEl("button",{text:`${days}D`,attr:{"aria-pressed":String(this.range===days)}});if(this.range===days)button.addClass("is-active");button.onclick=()=>{this.range=days;this.render();};});
    const metrics=root.createDiv({cls:"pdl-stats-metrics"});
    [
      [L("Total cards", "Tổng số thẻ"), this.cards.length, "layers-3", L("All curated cards", "Toàn bộ thẻ")],
      [L("Due now", "Đến hạn"), data.due, "alarm-clock", L("Current workload", "Khối lượng hiện tại")],
      [L("New cards", "Thẻ mới"), data.newCards, "sparkles", L("Never reviewed", "Chưa ôn lần nào")],
      [L("Mature", "Thành thạo"), data.mature, "shield-check", L("Interval ≥ 21 days", "Khoảng ôn ≥ 21 ngày")],
      [L("Retention", "Độ ghi nhớ"), `${data.retention}%`, "brain", L("Hard or better", "Từ Hard trở lên")],
      [L(`${this.range}-day reviews`, `${this.range} ngày ôn`), data.recent.length, "history", L("Completed attempts", "Lượt đã hoàn thành")],
      [L("Suspended", "Tạm dừng"), data.suspended, "pause-circle", L("Excluded from reviews", "Không vào phiên ôn")]
    ].forEach(([label,value,icon,note],index)=>{
      const card=metrics.createDiv({cls:`pdl-stats-kpi is-${index+1}`});
      const glyph=card.createSpan();setIcon(glyph,icon);
      const content=card.createDiv();content.createSpan({text:label});
      content.createEl("strong",{text:typeof value==="number"?formatCount(value,value>=10000):value});
      content.createEl("small",{text:note});
    });
    const grid=root.createDiv({cls:"pdl-stats-grid"});
    const activity=grid.createDiv({cls:"pdl-stats-panel pdl-activity-panel"});
    this.panelTitle(activity, L("Review Activity", "Hoạt động ôn tập"), L(`${formatCount(data.recent.length)} reviews over ${this.range} days`, `${formatCount(data.recent.length)} lượt ôn trong ${this.range} ngày`));
    const max=Math.max(1,...data.days.map(day=>day.count));
    const bars=activity.createDiv({cls:"pdl-activity-chart",attr:{role:"img","aria-label":L(`${data.recent.length} reviews over the last ${this.range} days`, `${data.recent.length} lượt ôn trong ${this.range} ngày qua`)}});
    data.days.forEach((day,index)=>{const bar=bars.createDiv({cls:"pdl-activity-day",attr:{tabindex:"0",title:L(`${day.label}: ${day.count} reviews`, `${day.label}: ${day.count} lượt ôn`)}});bar.createDiv({cls:"pdl-activity-bar",attr:{style:`height:${Math.max(day.count?8:2,day.count/max*100)}%`}});if(this.range<=30&&(index===0||index===data.days.length-1||index%7===0))bar.createSpan({text:day.label});});
    const ratings=grid.createDiv({cls:"pdl-stats-panel pdl-ratings-panel"});
    this.panelTitle(ratings, L("Rating Distribution", "Phân bố đánh giá"), L("Recall quality for the selected range", "Chất lượng ghi nhớ trong khoảng đã chọn"));
    const ratingTotal=Math.max(1,data.ratings.reduce((sum,item)=>sum+item.count,0));
    const labels=[L("Again", "Lại"), L("Hard", "Khó"), L("Good", "Tốt"), L("Easy", "Dễ")];
    data.ratings.forEach((item,index)=>{const row=ratings.createDiv({cls:`pdl-rating-row is-${item.grade}`});row.createSpan({text:labels[index]});const track=row.createDiv({cls:"pdl-rating-track"});track.createDiv({attr:{style:`width:${item.count/ratingTotal*100}%`}});row.createEl("strong",{text:formatCount(item.count)});});
    const decks=root.createDiv({cls:"pdl-stats-panel pdl-deck-performance"});
    this.panelTitle(decks, L("Deck Performance", "Hiệu quả theo deck"), L("Highest workload first · top 12 decks", "Ưu tiên deck nhiều việc · 12 deck đầu"));
    const table=decks.createDiv({cls:"pdl-stats-deck-table"});
    const header=table.createDiv({cls:"pdl-stats-deck-row is-header"});
    [L("Deck", "Deck"), L("Cards", "Thẻ"), L("Due", "Đến hạn"), L("Mature", "Thành thạo"), L("Reviews", "Lượt ôn")].forEach(label=>header.createSpan({text:label}));
    data.deckRows.forEach(deck=>{const row=table.createDiv({cls:"pdl-stats-deck-row"});const name=row.createDiv();name.createEl("strong",{text:deck.title});name.createSpan({text:deck.source});row.createSpan({text:formatCount(deck.cards.length)});row.createSpan({text:formatCount(deck.due)});const progress=row.createDiv({cls:"pdl-maturity-cell"});progress.createSpan({text:`${deck.cards.length?Math.round(deck.mature/deck.cards.length*100):0}%`});const track=progress.createDiv();track.createDiv({attr:{style:`width:${deck.cards.length?deck.mature/deck.cards.length*100:0}%`}});row.createSpan({text:formatCount(deck.reviews)});});
    if(!data.deckRows.length)table.createDiv({cls:"pdl-stats-empty",text:L("Create a deck to start measuring progress.", "Tạo một deck để bắt đầu đo tiến độ.")});
    const hard=root.createDiv({cls:"pdl-stats-panel pdl-hardest-panel"});
    this.panelTitle(hard, L("Cards Needing Attention", "Thẻ cần chú ý"), L("Cards with the most lapses", "Thẻ có nhiều lần quên nhất"));
    if(!data.difficult.length)hard.createDiv({cls:"pdl-stats-empty",text:L("No lapsed cards yet. Keep reviewing to reveal useful patterns.", "Chưa có thẻ nào bị quên. Tiếp tục ôn để thấy các mẫu hữu ích.")});
    else data.difficult.forEach((item,index)=>{const row=hard.createDiv({cls:"pdl-hard-card"});row.createSpan({text:String(index+1).padStart(2,"0")});const text=row.createDiv();text.createEl("strong",{text:item.card.question});text.createSpan({text:item.card.sourceFile?.basename||item.card.deckTitle});row.createEl("b",{text:L(`${item.lapses} ${item.lapses===1?"lapse":"lapses"}`, `${item.lapses} lần quên`)});const edit=row.createEl("button",{attr:{"aria-label":L(`Edit ${item.card.question}`, `Sửa ${item.card.question}`)}});setIcon(edit,"pencil");edit.onclick=()=>new FlashcardEditModal(this.app,this.plugin,item.card,async()=>{this.cards=await this.plugin.getCards();this.render();}).open();});
  }

  panelTitle(parent,title,subtitle){
    const head=parent.createDiv({cls:"pdl-stats-panel-head"});
    const copy=head.createDiv();
    copy.createEl("h3",{text:title});
    copy.createEl("p",{text:subtitle});
  }
}


export { FlashcardStatisticsModal };
