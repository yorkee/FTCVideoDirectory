import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const reply=(body:unknown,status=200)=>Response.json(body,{status});
function links(html:string) {
 return [...html.matchAll(/<(?:a|iframe)\b[^>]*(?:href|src)\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)(?:<\/a>|<\/iframe>|(?=<a\b))/gi)].map(m=>({url:m[1].replace(/&amp;/g,"&"),title:m[2].replace(/<[^>]*>/g," ").trim().slice(0,250)}));
}
function video(value:string) {
 try {const u=new URL(value);if(u.protocol!=="https:")return null;
 const id=u.hostname==="youtu.be"?u.pathname.split("/")[1]:["www.youtube.com","youtube.com","m.youtube.com","www.youtube-nocookie.com"].includes(u.hostname)?(u.pathname==="/watch"?u.searchParams.get("v"):/^\/(live|embed)\//.test(u.pathname)?u.pathname.split("/")[2]:null):null;
 return id&&/^[\w-]{11}$/.test(id)?"https://www.youtube.com/watch?v="+id:null;}catch{return null;}
}
async function page(url:string,headers?:HeadersInit){const r=await fetch(url,{headers,redirect:"error",signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error("Source HTTP "+r.status);return r;}
Deno.serve(async req=>{
 if(req.method!=="POST")return reply({error:"POST required"},405);
 const key=Deno.env.get("FTC_DISCOVERY_TOKEN");
 if(!key||req.headers.get("Authorization")!=="Bearer "+key)return reply({error:"Unauthorized"},401);
 try {
 const {seasonYear,eventCode}=await req.json();
 if(!Number.isInteger(seasonYear)||seasonYear<2019||seasonYear>2100||typeof eventCode!=="string"||!/^[A-Za-z0-9_-]{2,40}$/.test(eventCode))return reply({error:"Invalid event"},400);
 const db=createClient(Deno.env.get("SUPABASE_URL")!,JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}").default,{auth:{persistSession:false}});
 const {data:event,error}=await db.from("ftc_events").select("event_code,event_name,official_livestream_url").eq("season_year",seasonYear).eq("event_code",eventCode).single();
 if(error||!event)return reply({error:"Event not indexed"},404);
 const warnings:string[]=[];const candidates:{url:string;title:string}[]=[];
 const official="https://ftc-events.firstinspires.org/"+seasonYear+"/"+encodeURIComponent(eventCode);
 const username=Deno.env.get("FIRST_API_USERNAME"),token=Deno.env.get("FIRST_API_TOKEN");
 if(username&&token)try{const p=await (await page("https://ftc-api.firstinspires.org/v2.0/"+seasonYear+"/events?eventCode="+encodeURIComponent(eventCode),{Authorization:"Basic "+btoa(username+":"+token)})).json();
 for(const e of p.events??[])if(String(e.code).toLowerCase()===eventCode.toLowerCase())for(const url of [e.liveStreamUrl,...(Array.isArray(e.webcasts)?e.webcasts:[])])if(typeof url==="string")candidates.push({url,title:"Official livestream"});
 }catch{warnings.push("FIRST API unavailable");}
 try{candidates.push(...links(await (await page(official)).text()));}catch{warnings.push("FIRST event page unavailable");}
 const provider=candidates.find(c=>{try{const u=new URL(c.url);return u.origin==="https://fimav.us"&&!u.username&&!u.password&&u.pathname.toLowerCase()===("/live/"+seasonYear+"/"+eventCode).toLowerCase();}catch{return false;}})?.url;
 if(provider){const u=new URL(provider);const safe=u.origin+u.pathname;
 const {error}=await db.from("ftc_events").update({official_livestream_url:safe}).eq("season_year",seasonYear).eq("event_code",eventCode);if(error)throw error;
 try{candidates.push(...links(await (await page(safe)).text()));}catch{warnings.push("Regional provider unavailable; official link retained");}}
 const recordings=new Map<string,{season_year:number;event_code:string;youtube_url:string;recording_type:string;verified:boolean}>();
 for(const c of candidates){const url=video(c.url);if(!url)continue;const kind=/practice|inspection/i.test(c.title)?"practice":/competition|qualification|playoff/i.test(c.title)?"competition":"unknown";const old=recordings.get(url);if(!old||kind==="practice"||old.recording_type==="unknown")recordings.set(url,{season_year:seasonYear,event_code:eventCode,youtube_url:url,recording_type:kind,verified:true});}
 if(recordings.size){const {error}=await db.from("ftc_event_videos").upsert([...recordings.values()],{onConflict:"season_year,event_code,youtube_url",ignoreDuplicates:true});if(error)throw error;}
 return reply({success:true,official_livestream_url:provider??event.official_livestream_url,recordings:[...recordings.values()],warnings});
 }catch(e){console.error(e);return reply({error:"Discovery failed"},502);}
});
