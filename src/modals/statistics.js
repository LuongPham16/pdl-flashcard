/** Learning statistics dashboard dialog. */
import { Modal, Notice, setIcon, MarkdownRenderer } from "obsidian";
import {
  parseCloze,
  formatRichInline,
  formatRichText,
  formatRichCodeAware,
  wireCodeToggles
} from "../formatting.js";
import { normalizeCardText, dateKey, formatCount } from "../utils.js";
import { DAY } from "../constants.js";
import { FlashcardEditModal } from "./edit.js";

class FlashcardStatisticsModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; this.cards = []; this.range = 30; }
  async onOpen() { this.modalEl.addClass("pdl-stats-modal"); this.contentEl.createDiv({ cls: "pdl-stats-loading", text: "Calculating learning statistics…" }); this.cards = await this.plugin.getCards(); this.render(); }

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
    for (let i = this.range - 1; i >= 0; i--) { const date = new Date(now); date.setHours(0,0,0,0); date.setDate(date.getDate() - i); const key = dateKey(date.getTime()); days.push({ key, label: new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric" }).format(date), count: recent.filter(review => dateKey(review.at) === key).length }); }
    const ratings = [1,2,3,4].map(grade => ({ grade, count: recent.filter(review => review.grade === grade).length }));
    const decks = new Map();
    this.cards.forEach(card => { if (!decks.has(card.file.path)) decks.set(card.file.path, { title:card.deckTitle, source:card.sourceFile?.basename || card.sourcePath || "Missing source", cards:[], reviews:0 }); decks.get(card.file.path).cards.push(card); });
    const cardById = new Map(this.cards.map(card => [card.id, card]));
    knownReviews.forEach(review => { const card=cardById.get(review.cardId); if(card&&decks.has(card.file.path)) decks.get(card.file.path).reviews++; });
    const deckRows = [...decks.values()].map(deck => ({ ...deck, due:deck.cards.filter(card=>!schedule[card.id]||schedule[card.id].due<=now).length, mature:deck.cards.filter(card=>(schedule[card.id]?.interval||0)>=21).length })).sort((a,b)=>b.due-a.due||b.cards.length-a.cards.length).slice(0,12);
    const difficult = this.cards.map(card => ({ card, lapses:schedule[card.id]?.lapses||0, reps:schedule[card.id]?.reps||0 })).filter(item=>item.lapses>0).sort((a,b)=>b.lapses-a.lapses||b.reps-a.reps).slice(0,8);
    return { knownReviews, recent, due, newCards, mature, suspended, retention, uniqueReviewed, days, ratings, deckRows, difficult };
  }

  render() {
    const root=this.contentEl; root.empty(); const data=this.getData();
    const head=root.createDiv({cls:"pdl-stats-head"}); const copy=head.createDiv(); copy.createSpan({text:"LEARNING INTELLIGENCE"}); copy.createEl("h2",{text:"Statistics Dashboard"}); copy.createEl("p",{text:"Workload, retention, activity, and card quality across your entire library."});
    const ranges=head.createDiv({cls:"pdl-stats-ranges",attr:{role:"group","aria-label":"Statistics time range"}}); [14,30,90].forEach(days=>{const button=ranges.createEl("button",{text:`${days}D`,attr:{"aria-pressed":String(this.range===days)}});if(this.range===days)button.addClass("is-active");button.onclick=()=>{this.range=days;this.render();};});
    const metrics=root.createDiv({cls:"pdl-stats-metrics"});
    [["Total cards",this.cards.length,"layers-3","All curated cards"],["Due now",data.due,"alarm-clock","Current workload"],["New cards",data.newCards,"sparkles","Never reviewed"],["Mature",data.mature,"shield-check","Interval ≥ 21 days"],["Retention",`${data.retention}%`,"brain","Hard or better"],[`${this.range}-day reviews`,data.recent.length,"history","Completed attempts"],["Suspended",data.suspended,"pause-circle","Excluded from reviews"]].forEach(([label,value,icon,note],index)=>{const card=metrics.createDiv({cls:`pdl-stats-kpi is-${index+1}`});const glyph=card.createSpan();setIcon(glyph,icon);const content=card.createDiv();content.createSpan({text:label});content.createEl("strong",{text:typeof value==="number"?formatCount(value,value>=10000):value});content.createEl("small",{text:note});});
    const grid=root.createDiv({cls:"pdl-stats-grid"});
    const activity=grid.createDiv({cls:"pdl-stats-panel pdl-activity-panel"}); this.panelTitle(activity,"Review Activity",`${formatCount(data.recent.length)} reviews over ${this.range} days`);
    const max=Math.max(1,...data.days.map(day=>day.count)); const bars=activity.createDiv({cls:"pdl-activity-chart",attr:{role:"img","aria-label":`${data.recent.length} reviews over the last ${this.range} days`}}); data.days.forEach((day,index)=>{const bar=bars.createDiv({cls:"pdl-activity-day",attr:{tabindex:"0",title:`${day.label}: ${day.count} reviews`}});bar.createDiv({cls:"pdl-activity-bar",attr:{style:`height:${Math.max(day.count?8:2,day.count/max*100)}%`}});if(this.range<=30&&(index===0||index===data.days.length-1||index%7===0))bar.createSpan({text:day.label});});
    const ratings=grid.createDiv({cls:"pdl-stats-panel pdl-ratings-panel"}); this.panelTitle(ratings,"Rating Distribution","Recall quality for the selected range"); const ratingTotal=Math.max(1,data.ratings.reduce((sum,item)=>sum+item.count,0)); const labels=["Again","Hard","Good","Easy"]; data.ratings.forEach((item,index)=>{const row=ratings.createDiv({cls:`pdl-rating-row is-${item.grade}`});row.createSpan({text:labels[index]});const track=row.createDiv({cls:"pdl-rating-track"});track.createDiv({attr:{style:`width:${item.count/ratingTotal*100}%`}});row.createEl("strong",{text:formatCount(item.count)});});
    const decks=root.createDiv({cls:"pdl-stats-panel pdl-deck-performance"}); this.panelTitle(decks,"Deck Performance","Highest workload first · top 12 decks"); const table=decks.createDiv({cls:"pdl-stats-deck-table"}); const header=table.createDiv({cls:"pdl-stats-deck-row is-header"});["Deck","Cards","Due","Mature","Reviews"].forEach(label=>header.createSpan({text:label})); data.deckRows.forEach(deck=>{const row=table.createDiv({cls:"pdl-stats-deck-row"});const name=row.createDiv();name.createEl("strong",{text:deck.title});name.createSpan({text:deck.source});row.createSpan({text:formatCount(deck.cards.length)});row.createSpan({text:formatCount(deck.due)});const progress=row.createDiv({cls:"pdl-maturity-cell"});progress.createSpan({text:`${deck.cards.length?Math.round(deck.mature/deck.cards.length*100):0}%`});const track=progress.createDiv();track.createDiv({attr:{style:`width:${deck.cards.length?deck.mature/deck.cards.length*100:0}%`}});row.createSpan({text:formatCount(deck.reviews)});}); if(!data.deckRows.length)table.createDiv({cls:"pdl-stats-empty",text:"Create a deck to start measuring progress."});
    const hard=root.createDiv({cls:"pdl-stats-panel pdl-hardest-panel"}); this.panelTitle(hard,"Cards Needing Attention","Cards with the most lapses"); if(!data.difficult.length)hard.createDiv({cls:"pdl-stats-empty",text:"No lapsed cards yet. Keep reviewing to reveal useful patterns."}); else data.difficult.forEach((item,index)=>{const row=hard.createDiv({cls:"pdl-hard-card"});row.createSpan({text:String(index+1).padStart(2,"0")});const text=row.createDiv();text.createEl("strong",{text:item.card.question});text.createSpan({text:item.card.sourceFile?.basename||item.card.deckTitle});row.createEl("b",{text:`${item.lapses} ${item.lapses===1?"lapse":"lapses"}`});const edit=row.createEl("button",{attr:{"aria-label":`Edit ${item.card.question}`}});setIcon(edit,"pencil");edit.onclick=()=>new FlashcardEditModal(this.app,this.plugin,item.card,async()=>{this.cards=await this.plugin.getCards();this.render();}).open();});
  }

  panelTitle(parent,title,subtitle){const head=parent.createDiv({cls:"pdl-stats-panel-head"});const copy=head.createDiv();copy.createEl("h3",{text:title});copy.createEl("p",{text:subtitle});}
}


export { FlashcardStatisticsModal };
