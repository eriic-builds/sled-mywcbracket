// Interaction layer — extracted VERBATIM from wc26-bracket build_dashboard.py (JS constant).
// Wrapped in initInteractions() so it runs AFTER render.js injects the dashboard DOM.
export function initInteractions(){

(function(){
 var root=document.documentElement,LS=window.localStorage;
 var KTHEME='wcb.theme',KFAV='wcb.favs',KFO='wcb.favonly',KSC='wcb.scores.v3';
 function setTheme(t){root.setAttribute('data-theme',t);document.querySelectorAll('.modes button').forEach(function(b){if(b.dataset.mode)b.classList.toggle('on',b.dataset.mode===t)});if(funBtn)funBtn.classList.toggle('on',!!FUN[t]);try{LS.setItem(KTHEME,t)}catch(e){}closeFun();if(window.__drawConn)setTimeout(window.__drawConn,80);}
 var FUN={geocities:1,minecraft:1,winxp:1,doodle:1};
 var funWrap=document.getElementById('funWrap'),funBtn=document.getElementById('funBtn');
 function closeFun(){if(funWrap){funWrap.classList.remove('open');if(funBtn)funBtn.setAttribute('aria-expanded','false');}}
 document.querySelectorAll('.modes button').forEach(function(b){if(b.dataset.mode)b.addEventListener('click',function(){setTheme(b.dataset.mode)})});
 if(funBtn){funBtn.addEventListener('click',function(e){e.stopPropagation();var open=funWrap.classList.toggle('open');funBtn.setAttribute('aria-expanded',open?'true':'false');});}
 document.addEventListener('click',function(e){if(funWrap&&!funWrap.contains(e.target))closeFun();});
 document.addEventListener('keydown',function(e){if(e.key==='Escape')closeFun();});
 var t0;try{t0=LS.getItem(KTHEME)}catch(e){}setTheme(t0||'dark');
 var favs={};try{favs=JSON.parse(LS.getItem(KFAV)||'{}')||{}}catch(e){favs={}}
 function saveFav(){try{LS.setItem(KFAV,JSON.stringify(favs))}catch(e){}}
 function isFav(t){return !!favs[t]}
 var search=document.getElementById('search'),favOnly=document.getElementById('favonly'),countEl=document.getElementById('count');
 var chips=[].slice.call(document.querySelectorAll('.chip'));
 var teamCells=[].slice.call(document.querySelectorAll('.team[data-team]'));
 var ffCells=[].slice.call(document.querySelectorAll('.ff[data-team]'));
 var scRows=[].slice.call(document.querySelectorAll('.scrow[data-team]'));
 var allTeams={};teamCells.forEach(function(c){allTeams[c.dataset.team]=1});var TOTAL=Object.keys(allTeams).length;
 function paintFav(){document.querySelectorAll('.star').forEach(function(s){s.classList.toggle('fav',isFav(s.dataset.star));s.textContent=isFav(s.dataset.star)?'★':'☆';});teamCells.forEach(function(c){c.classList.toggle('fav',isFav(c.dataset.team))});}
 function apply(){var q=(search.value||'').trim().toLowerCase(),fo=favOnly.checked,shown={};
  function ok(t){if(fo&&!isFav(t))return false;if(q&&t.toLowerCase().indexOf(q)===-1)return false;return true;}
  teamCells.forEach(function(c){var g=ok(c.dataset.team);c.classList.toggle('dim',!g);if(g)shown[c.dataset.team]=1;});
  ffCells.forEach(function(c){c.classList.toggle('dim',!ok(c.dataset.team))});
  scRows.forEach(function(r){r.classList.toggle('dim',!r.dataset.team.split('|').some(ok))});
  chips.forEach(function(ch){ch.classList.toggle('on',q&&ch.dataset.team.toLowerCase()===q)});
  countEl.textContent='Showing '+((q||fo)?Object.keys(shown).length:TOTAL)+' of '+TOTAL+' teams';}
 search.addEventListener('input',apply);
 favOnly.addEventListener('change',function(){try{LS.setItem(KFO,favOnly.checked?'1':'0')}catch(e){}apply();});
 chips.forEach(function(ch){ch.addEventListener('click',function(e){if(e.target.classList.contains('star'))return;var t=ch.dataset.team;search.value=(search.value.trim().toLowerCase()===t.toLowerCase())?'':t;apply();});});
 document.querySelectorAll('.star').forEach(function(s){function tg(ev){ev.stopPropagation();var t=s.dataset.star;favs[t]=!isFav(t);if(!favs[t])delete favs[t];saveFav();paintFav();apply();}s.addEventListener('click',tg);s.addEventListener('keydown',function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();tg(ev);}});});
 document.getElementById('clear').addEventListener('click',function(){search.value='';favOnly.checked=false;try{LS.setItem(KFO,'0')}catch(e){}apply();});
 document.getElementById('dab').addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'})});
 try{if(LS.getItem(KFO)==='1')favOnly.checked=true;}catch(e){}
 var scores={};try{scores=JSON.parse(LS.getItem(KSC)||'{}')||{}}catch(e){scores={}}
 var rows=[].slice.call(document.querySelectorAll('.scrow[data-pick]'));
 function statusOf(r){return scores[r.dataset.pick]||r.dataset.default;}
 function saveScores(){try{LS.setItem(KSC,JSON.stringify(scores))}catch(e){}}
 function recalc(){var conf=0,live=0,out=0,MAXP=parseInt(document.getElementById('scMax').dataset.max||'80',10);
  rows.forEach(function(r){var st=statusOf(r),pts=+r.dataset.pts;
   r.classList.toggle('is-won',st==='won');r.classList.toggle('is-lost',st==='lost');
   r.querySelectorAll('.seg button').forEach(function(b){b.classList.toggle('on',b.dataset.set===st)});
   if(st==='won')conf+=pts;else if(st==='lost')out+=pts;else live+=pts;});
  function set(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  set('scConfirmed',conf);set('scConfirmed2',conf);set('scLive',live);set('scOut',out);set('scMax',conf+live);set('scSoFar',conf+'/'+(conf+out));
  set('kpiConfirmed',conf);set('kpiLive',live);
  var bar=document.getElementById('scBar');if(bar)bar.style.width=Math.round(conf/MAXP*100)+'%';}
 rows.forEach(function(r){r.querySelectorAll('.seg button').forEach(function(b){b.addEventListener('click',function(){var id=r.dataset.pick,s=b.dataset.set;if(s===r.dataset.default)delete scores[id];else scores[id]=s;saveScores();recalc();});});});
 var rst=document.getElementById('scReset');if(rst)rst.addEventListener('click',function(){scores={};saveScores();recalc();});
 // ---- bracket connector lines (elbow paths, coloured by whether each pick came true) ----
 function activeBracket(){var w=document.querySelector('.brk-wrap');if(!w)return document.querySelector('.bracket');return w.querySelector('.bracket.mode-'+(w.getAttribute('data-view')||'actual'));}
 function drawConnectors(){
   var bracket=activeBracket();if(!bracket)return;
   var svg=bracket.querySelector('.bksvg');
   if(!bracket||!svg) return;
   var brect=bracket.getBoundingClientRect(),W=bracket.scrollWidth,Hh=bracket.scrollHeight;
   svg.setAttribute('width',W);svg.setAttribute('height',Hh);svg.setAttribute('viewBox','0 0 '+W+' '+Hh);
   while(svg.firstChild)svg.removeChild(svg.firstChild);
   function P(el){var r=el.getBoundingClientRect();return{r:r.right-brect.left+bracket.scrollLeft,l:r.left-brect.left+bracket.scrollLeft,y:(r.top+r.bottom)/2-brect.top+bracket.scrollTop};}
   var rounds=[].slice.call(bracket.querySelectorAll('.round'));
   // Link each still-advancing team's box to the same team's box in the previous round.
   for(var ri=1;ri<rounds.length;ri++){
     var targets=[].slice.call(rounds[ri].querySelectorAll('.team[data-team]'));
     targets.forEach(function(tb){
       var team=tb.getAttribute('data-team');
       var src=rounds[ri-1].querySelector('.team[data-team="'+team+'"]');
       if(!src) return;
       var a=P(src),b=P(tb),x1=a.r+1,x2=b.l-1,xm=Math.round((x1+x2)/2);
       var d='M'+Math.round(x1)+' '+Math.round(a.y)+' H'+xm+' V'+Math.round(b.y)+' H'+Math.round(x2);
       var st=tb.classList.contains('st-won')?'won':tb.classList.contains('st-lost')?'lost':tb.classList.contains('st-actual')?'actual':'pending';
       var gone=tb.classList.contains('gone');
       var p=document.createElementNS('http://www.w3.org/2000/svg','path');
       p.setAttribute('d',d);p.setAttribute('class','conn c-'+st+(gone?' gone':''));svg.appendChild(p);
     });
   }
 }
 window.__drawConn=drawConnectors;
 document.querySelectorAll('.brk-toggle button').forEach(function(bt){bt.addEventListener('click',function(){var w=document.querySelector('.brk-wrap');w.setAttribute('data-view',bt.dataset.view);document.querySelectorAll('.brk-toggle button').forEach(function(x){x.classList.toggle('on',x===bt);});setTimeout(drawConnectors,60);});});
 document.querySelectorAll('.res-toggle button').forEach(function(bt){bt.addEventListener('click',function(){var w=document.querySelector('.res-wrap');w.setAttribute('data-view',bt.dataset.view);document.querySelectorAll('.res-toggle button').forEach(function(x){x.classList.toggle('on',x===bt);});});});
 document.querySelectorAll('.sec-toggle').forEach(function(bt){bt.addEventListener('click',function(){var body=document.getElementById(bt.getAttribute('aria-controls'));if(!body)return;var open=bt.getAttribute('aria-expanded')!=='false';bt.setAttribute('aria-expanded',open?'false':'true');body.classList.toggle('collapsed',open);});});
 var _rt;window.addEventListener('resize',function(){clearTimeout(_rt);_rt=setTimeout(drawConnectors,120);});
 window.addEventListener('load',function(){setTimeout(drawConnectors,60);});
 // Redraw whenever the bracket's box actually changes size (fonts landing, section
 // collapse/expand, theme swaps) — catches every "lines don't connect" layout shift
 // that the resize event alone misses.
 if(window.ResizeObserver){var _ro=new ResizeObserver(function(){clearTimeout(_rt);_rt=setTimeout(drawConnectors,80);});var _bw=document.querySelector('.brk-wrap');if(_bw)_ro.observe(_bw);}
 if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){setTimeout(drawConnectors,30);});
 // ---- hover: quick World Cup stat card on each team box ----
 var card=document.getElementById('statcard');
 function posCard(ev){var pad=14,w=card.offsetWidth,h=card.offsetHeight,x=ev.clientX+16,y=ev.clientY+16;
   if(x+w>window.innerWidth-pad)x=ev.clientX-w-16; if(x<pad)x=pad;
   if(y+h>window.innerHeight-pad)y=window.innerHeight-h-pad; if(y<pad)y=pad;
   card.style.left=x+'px'; card.style.top=y+'px';}
 function showCard(el,ev){var t=el.getAttribute('data-team'),s=window.WCSTATS&&window.WCSTATS[t]; if(!s||!card)return;
   card.innerHTML='<div class="sc-name"><span class="seed">'+(s.s||'')+'</span>'+t+'</div>'
     +'<div class="sc-row"><span class="k">World Cup titles</span><span class="v gold">'+(s.t?('🏆 '+s.t):'—')+'</span></div>'
     +'<div class="sc-row"><span class="k">Best finish</span><span class="v">'+s.b+'</span></div>'
     +'<div class="sc-row"><span class="k">This World Cup</span><span class="v">'+s.y+'</span></div>';
   posCard(ev); card.classList.add('show');}
 document.querySelectorAll('.team[data-team]').forEach(function(el){
   el.addEventListener('mouseenter',function(ev){showCard(el,ev)});
   el.addEventListener('mousemove',posCard);
   el.addEventListener('mouseleave',function(){card.classList.remove('show')});});
 paintFav();apply();recalc();drawConnectors();
 // ── side-nav rail: mobile toggle + scrollspy ──
 var rail=document.getElementById('rail'),navToggle=document.getElementById('navToggle');
 if(navToggle&&rail){navToggle.addEventListener('click',function(){var o=rail.classList.toggle('open');navToggle.setAttribute('aria-expanded',o?'true':'false');});}
 var railLinks=rail?rail.querySelectorAll('.links a'):[];
 if(railLinks.length){
   var linkFor={};
   railLinks.forEach(function(a){linkFor[a.getAttribute('href').slice(1)]=a;a.addEventListener('click',function(){rail.classList.remove('open');if(navToggle)navToggle.setAttribute('aria-expanded','false');});});
   var secs=document.querySelectorAll('#intro, .shead[id]');
   var spy=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){railLinks.forEach(function(l){l.classList.remove('active');});var a=linkFor[e.target.id];if(a)a.classList.add('active');}});},{rootMargin:'-45% 0px -50% 0px',threshold:0});
   secs.forEach(function(s){spy.observe(s);});
 }
})();

}
