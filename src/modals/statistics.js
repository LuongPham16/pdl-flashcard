/** Learning statistics dashboard dialog. */
import { Modal, setIcon } from "obsidian";
import { dateKey, formatCount } from "../utils.js";
import { DAY } from "../constants.js";
import { L, locale } from "../i18n.js";
import { FlashcardEditModal } from "./edit.js";

const DECK_PAGE_SIZE = 6;
const HARD_PAGE_SIZE = 5;

class FlashcardStatisticsModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.cards = [];
    this.range = 30;
    this.deckPage = 0;
    this.hardPage = 0;
  }

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
      .map(deck => ({
        ...deck,
        due:deck.cards.filter(card=>this.plugin.isCardAvailable(card,now)&&(!schedule[card.id]||schedule[card.id].due<=now)).length,
        mature:deck.cards.filter(card=>(schedule[card.id]?.interval||0)>=21&&!schedule[card.id]?.suspended).length
      }))
      .sort((a,b)=>b.due-a.due||b.cards.length-a.cards.length);
    const difficult = this.cards.map(card => ({ card, lapses:schedule[card.id]?.lapses||0, reps:schedule[card.id]?.reps||0 })).filter(item=>item.lapses>0).sort((a,b)=>b.lapses-a.lapses||b.reps-a.reps);
    return { knownReviews, recent, due, newCards, mature, suspended, retention, uniqueReviewed, days, ratings, deckRows, difficult };
  }

  render() {
    const root=this.contentEl; root.empty(); const data=this.getData();
    const head=root.createDiv({cls:"pdl-stats-head"}); const copy=head.createDiv();
    copy.createSpan({text:L("LEARNING INTELLIGENCE", "TRÍ TUỆ HỌC TẬP")});
    copy.createEl("h2",{text:L("Statistics Dashboard", "Bảng thống kê")});
    copy.createEl("p",{text:L("Workload, retention, activity, and card quality across your entire library.", "Khối lượng, độ ghi nhớ, hoạt động và chất lượng thẻ trong toàn thư viện.")});
    const ranges=head.createDiv({cls:"pdl-stats-ranges",attr:{role:"group","aria-label":L("Statistics time range", "Khoảng thời gian thống kê")}});
    [14,30,90].forEach(days=>{const button=ranges.createEl("button",{text:`${days}D`,attr:{"aria-pressed":String(this.range===days)}});if(this.range===days)button.addClass("is-active");button.onclick=()=>{this.range=days;this.deckPage=0;this.hardPage=0;this.render();};});
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
    const buckets = [];
    if (this.range === 90) {
      for (let index = 0; index < data.days.length; index += 7) {
        const slice = data.days.slice(index, index + 7);
        if (!slice.length) continue;
        buckets.push({
          label: slice[0].label,
          endLabel: slice[slice.length - 1].label,
          count: slice.reduce((sum, day) => sum + day.count, 0)
        });
      }
    } else {
      data.days.forEach(day => buckets.push({ label: day.label, endLabel: day.label, count: day.count }));
    }
    const max=Math.max(1,...buckets.map(bucket=>bucket.count));
    const bars=activity.createDiv({cls:"pdl-activity-chart",attr:{role:"img","aria-label":L(`${data.recent.length} reviews over the last ${this.range} days`, `${data.recent.length} lượt ôn trong ${this.range} ngày qua`)}});
    if (!data.recent.length) {
      bars.createDiv({ cls: "pdl-stats-empty", text: L("No reviews in this period yet.", "Chưa có lượt ôn nào trong khoảng này.") });
    } else {
      buckets.forEach((bucket,index)=>{
        const period = bucket.label === bucket.endLabel ? bucket.label : `${bucket.label} – ${bucket.endLabel}`;
        const bar=bars.createDiv({cls:"pdl-activity-day",attr:{tabindex:"0",title:L(`${period}: ${bucket.count} reviews`, `${period}: ${bucket.count} lượt ôn`)}});
        const fill=bar.createDiv({cls:"pdl-activity-bar"});
        fill.setCssProps({ height: `${Math.max(bucket.count?8:2,bucket.count/max*100)}%` });
        if(this.range===90||this.range<=30&&(index===0||index===buckets.length-1||index%7===0))bar.createSpan({text:bucket.label});
      });
      if (this.range === 90) {
        activity.createDiv({ cls: "pdl-activity-note", text: L("Each bar is one 7-day period.", "Mỗi cột là một giai đoạn 7 ngày.") });
      }
    }
    const ratings=grid.createDiv({cls:"pdl-stats-panel pdl-ratings-panel"});
    this.panelTitle(ratings, L("Rating Distribution", "Phân bố đánh giá"), L("Recall quality for the selected range", "Chất lượng ghi nhớ trong khoảng đã chọn"));
    const ratingTotal=Math.max(1,data.ratings.reduce((sum,item)=>sum+item.count,0));
    const labels=[L("Again", "Lại"), L("Hard", "Khó"), L("Good", "Tốt"), L("Easy", "Dễ")];
    data.ratings.forEach((item,index)=>{
      const row=ratings.createDiv({cls:`pdl-rating-row is-${item.grade}`});
      row.createSpan({text:labels[index]});
      const track=row.createDiv({cls:"pdl-rating-track"});
      const fill=track.createDiv();
      fill.setCssProps({ width: `${item.count/ratingTotal*100}%` });
      row.createEl("strong",{text:formatCount(item.count)});
    });
    const decks=root.createDiv({cls:"pdl-stats-panel pdl-deck-performance"});
    this.panelTitle(decks, L("Deck Performance", "Hiệu quả theo deck"), L("Highest workload first · all decks", "Ưu tiên deck nhiều việc · tất cả deck"));
    const help=decks.createDiv({cls:"pdl-stats-help"});
    help.createSpan({text:L(
      "Cards = total cards · Ready now = available for review today · Mature = interval of 21+ days · Reviews = all-time answers",
      "Thẻ = tổng số thẻ · Sẵn sàng = có thể ôn hôm nay · Thành thạo = khoảng ôn từ 21 ngày · Lượt ôn = tổng số lần đã trả lời"
    )});
    const deckPages=Math.max(1,Math.ceil(data.deckRows.length/DECK_PAGE_SIZE));
    this.deckPage=Math.min(this.deckPage,deckPages-1);
    const deckStart=this.deckPage*DECK_PAGE_SIZE;
    const table=decks.createDiv({cls:"pdl-stats-deck-table"});
    const header=table.createDiv({cls:"pdl-stats-deck-row is-header"});
    [
      [L("Deck", "Deck"), ""],
      [L("Cards", "Thẻ"), L("Total cards in the deck", "Tổng số thẻ trong deck")],
      [L("Ready now", "Sẵn sàng"), L("Cards available to review now", "Số thẻ có thể ôn ngay")],
      [L("Mature", "Thành thạo"), L("Cards with an interval of 21 days or more", "Thẻ có khoảng ôn từ 21 ngày trở lên")],
      [L("Total reviews", "Tổng lượt ôn"), L("All-time answers for this deck", "Tổng số lần trả lời của deck")]
    ].forEach(([label, title]) => header.createSpan({text:label, attr:title ? { title } : {}}));
    data.deckRows.slice(deckStart,deckStart+DECK_PAGE_SIZE).forEach(deck=>{
      const row=table.createDiv({cls:"pdl-stats-deck-row"});
      const name=row.createDiv();
      name.createEl("strong",{text:deck.title});
      name.createSpan({text:deck.source});
      row.createSpan({text:formatCount(deck.cards.length)});
      row.createSpan({text:formatCount(deck.due)});
      const maturePercent=deck.cards.length?Math.round(deck.mature/deck.cards.length*100):0;
      const progress=row.createDiv({cls:"pdl-maturity-cell", attr:{ title:L(`${deck.mature} of ${deck.cards.length} cards are mature (${maturePercent}%)`, `${deck.mature}/${deck.cards.length} thẻ thành thạo (${maturePercent}%)`) }});
      progress.createSpan({cls:"pdl-maturity-label", text:`${maturePercent}% · ${formatCount(deck.mature)}/${formatCount(deck.cards.length)}`});
      const track=progress.createDiv();
      const fill=track.createDiv();
      fill.setCssProps({ width: `${maturePercent}%` });
      row.createSpan({text:formatCount(deck.reviews)});
    });
    if(!data.deckRows.length)table.createDiv({cls:"pdl-stats-empty",text:L("Create a deck to start measuring progress.", "Tạo một deck để bắt đầu đo tiến độ.")});
    else this.renderPager(decks,this.deckPage,deckPages,page=>{this.deckPage=page;this.render();});

    const hard=root.createDiv({cls:"pdl-stats-panel pdl-hardest-panel"});
    this.panelTitle(hard, L("Cards Needing Attention", "Thẻ cần chú ý"), L("Cards forgotten at least once · sorted by lapses", "Thẻ đã quên ít nhất một lần · xếp theo số lần quên"));
    const hardHelp=hard.createDiv({cls:"pdl-stats-help"});
    hardHelp.createSpan({text:L(
      "Lapses = times you pressed Again. This is a card-quality signal, not a list of cards due today. Rewrite vague cards or add context to the source note.",
      "Số lần quên = số lần bạn bấm Again. Đây là tín hiệu chất lượng thẻ, không phải danh sách thẻ đến hạn hôm nay. Nên viết lại thẻ mơ hồ hoặc bổ sung ngữ cảnh cho note nguồn."
    )});
    if(!data.difficult.length)hard.createDiv({cls:"pdl-stats-empty",text:L("No lapsed cards yet. Keep reviewing to reveal useful patterns.", "Chưa có thẻ nào bị quên. Tiếp tục ôn để thấy các mẫu hữu ích.")});
    else {
      const hardPages=Math.max(1,Math.ceil(data.difficult.length/HARD_PAGE_SIZE));
      this.hardPage=Math.min(this.hardPage,hardPages-1);
      const hardStart=this.hardPage*HARD_PAGE_SIZE;
      const hardList=hard.createDiv({cls:"pdl-stats-hard-list"});
      data.difficult.slice(hardStart,hardStart+HARD_PAGE_SIZE).forEach((item,index)=>{const row=hardList.createDiv({cls:"pdl-hard-card"});row.createSpan({text:String(hardStart+index+1).padStart(2,"0")});const text=row.createDiv();text.createEl("strong",{text:item.card.question});text.createSpan({text:item.card.sourceFile?.basename||item.card.deckTitle});row.createEl("b",{text:L(`${item.lapses} ${item.lapses===1?"lapse":"lapses"}`, `${item.lapses} lần quên`),attr:{title:L("Times this card was rated Again", "Số lần thẻ bị đánh giá Again")}});const edit=row.createEl("button",{attr:{"aria-label":L("Edit","Sửa"),title:L("Edit","Sửa")}});setIcon(edit,"pencil");edit.onclick=()=>new FlashcardEditModal(this.app,this.plugin,item.card,async()=>{this.cards=await this.plugin.getCards();this.render();}).open();});
      this.renderPager(hard,this.hardPage,hardPages,page=>{this.hardPage=page;this.render();});
    }
  }

  renderPager(parent,page,pages,onPage){
    if(pages<=1)return;
    const pager=parent.createDiv({cls:"pdl-stats-pager"});
    pager.createSpan({text:L(`Page ${page+1} of ${pages}`,`Trang ${page+1} / ${pages}`)});
    const nav=pager.createDiv();
    const previous=nav.createEl("button",{text:L("Previous","Trước")});
    previous.disabled=page===0;
    previous.onclick=()=>{if(page>0)onPage(page-1);};
    const next=nav.createEl("button",{text:L("Next","Sau")});
    next.disabled=page>=pages-1;
    next.onclick=()=>{if(page<pages-1)onPage(page+1);};
  }

  panelTitle(parent,title,subtitle){
    const head=parent.createDiv({cls:"pdl-stats-panel-head"});
    const copy=head.createDiv();
    copy.createEl("h3",{text:title});
    copy.createEl("p",{text:subtitle});
  }
}


export { FlashcardStatisticsModal };
