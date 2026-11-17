import type { IncomingMessage, ServerResponse } from "node:http";
import { addDays, addMonths, daysInMonth, currentMonthKey, isDateString, isMonthKey, monthStart } from "../../shared/months.js";
import { currentMonthlyChallenge, scoreMonthlyChallenge, type ChallengeTransaction } from "../../shared/leaderboard.js";
import { hiddenSourceIds, withoutHidden } from "../hidden-accounts.js";
import { requireSession } from "../auth/session.js";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { sendJson } from "../http/response.js";
import { budgetForMonth } from "./budget.js";

const pageSize = 1000;
async function transactions(admin: ReturnType<typeof createServiceSupabaseClient>, userId: string, month: string): Promise<ChallengeTransaction[]> {
  const hidden = await hiddenSourceIds(admin, userId);
  const out: ChallengeTransaction[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const q = await withoutHidden(admin.from("Transaction").select("transaction_id,amount,date,category_key,name").eq("user_id", userId)
      .gte("date", `${monthStart(month)}T00:00:00Z`).lt("date", `${monthStart(addMonths(month, 1))}T00:00:00Z`), hidden)
      .order("date").order("transaction_id").range(offset, offset + pageSize - 1)
      .returns<{transaction_id:string;amount:number|null;date:string|null;category_key:string|null;name:string|null}[]>();
    if (q.error) throw supabaseFailure(q.error);
    out.push(...(q.data ?? []).map(r => ({id:r.transaction_id,amount:r.amount,date:r.date,category:r.category_key,name:r.name})));
    if ((q.data ?? []).length < pageSize) break;
  }
  return out;
}

export async function handleHomeTrendsApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  if (pathname !== "/api/home-trends") return false;
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const {client,user} = await requireSession(request,response);
  const admin = createServiceSupabaseClient();
  const now = new Date();
  const url = new URL(request.url ?? pathname,"http://localhost");
  const requestedMonth = url.searchParams.get("month");
  const month = isMonthKey(requestedMonth) ? requestedMonth : currentMonthKey(now);
  const requestedDay = url.searchParams.get("today");
  const today = isDateString(requestedDay) && requestedDay.startsWith(`${month}-`) ? requestedDay : `${month}-${String(now.getUTCDate()).padStart(2,"0")}`;
  const months = Array.from({length:6},(_,i)=>addMonths(month,i-5));
  const memberResult = await client.rpc("leaderboard_members");
  if (memberResult.error && memberResult.error.code !== "PGRST202") throw supabaseFailure(memberResult.error);
  const members = ((memberResult.data ?? []) as {id:string;name:string}[]).slice(0,50);
  const memberSeries = await Promise.all(members.map(async member => {
    const monthly = [] as {label:string;value:number}[];
    for (const key of months) {
      const challenge = currentMonthlyChallenge(new Date(`${key}-15T12:00:00Z`));
      const [tx,budget] = await Promise.all([transactions(admin,member.id,key),budgetForMonth(admin,member.id,`${key}-01`)]);
      const score = scoreMonthlyChallenge(challenge,tx,budget.row?.monthly_income ?? null,budget.row?.monthly_budget ?? null).score;
      monthly.push({label:key,value:Math.round(score*100)/100});
    }
    const [tx,budget] = await Promise.all([transactions(admin,member.id,month),budgetForMonth(admin,member.id,`${month}-01`)]);
    const challenge = currentMonthlyChallenge(new Date(`${month}-15T12:00:00Z`));
    const count = Math.min(Number(today.slice(8)),daysInMonth(Number(month.slice(0,4)),Number(month.slice(5,7))));
    const daily = Array.from({length:count},(_,i)=>{
      const date=addDays(`${month}-01`,i); const through=tx.filter(row=>(row.date ?? "").slice(0,10)<=date);
      return {label:date.slice(8),value:Math.round(scoreMonthlyChallenge(challenge,through,budget.row?.monthly_income ?? null,budget.row?.monthly_budget ?? null).score*100)/100};
    });
    return {id:member.id,name:member.name,isYou:member.id===user.id,monthly,daily};
  }));
  const latest = await client.rpc("leaderboard_members");
  if (latest.error) throw supabaseFailure(latest.error);
  const allowed = new Set(((latest.data ?? []) as {id:string}[]).map(m=>m.id));
  const safeMembers = memberSeries.filter(m=>allowed.has(m.id)).map(({id,...m})=>m);
  const own = await transactions(admin,user.id,month);
  const ownMonthly = await Promise.all(months.map(async key=>{
    const [tx,budget]=await Promise.all([transactions(admin,user.id,key),budgetForMonth(client,user.id,`${key}-01`)]);
    const spent=tx.reduce((s,r)=>s+Math.max(0,Number(r.amount)||0),0);
    return {label:key,spent,saved:Math.max(0,(budget.row?.monthly_income ?? budget.row?.monthly_budget ?? 0)-spent)};
  }));
  const budget=await budgetForMonth(client,user.id,`${month}-01`);
  const dayCount=Math.min(now.getDate(),daysInMonth(now.getFullYear(),now.getMonth()+1));
  let spentSoFar=0;
  const ownDaily=Array.from({length:dayCount},(_,i)=>{
    const date=addDays(`${month}-01`,i);
    const spentThatDay=own.filter(r=>(r.date??"").slice(0,10)===date).reduce((s,r)=>s+Math.max(0,Number(r.amount)||0),0);
    spentSoFar+=spentThatDay;
    return {label:date.slice(8),spent:spentThatDay,saved:Math.max(0,(budget.row?.monthly_income??budget.row?.monthly_budget??0)-spentSoFar)};
  });
  response.setHeader("Cache-Control","no-store");
  sendJson(response,200,{month,monthly:ownMonthly,daily:ownDaily,friendsMonthly:safeMembers.map(({name,isYou,monthly})=>({name,isYou,values:monthly})),friendsDaily:safeMembers.map(({name,isYou,daily})=>({name,isYou,values:daily}))});
  return true;
}
