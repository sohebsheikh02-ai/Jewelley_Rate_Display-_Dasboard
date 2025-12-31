

import React, { useState, useEffect, useRef, useCallback } from "react";

// --- Constants & Keys ---
const ENDPOINT = "https://bcast.sagarjewellers.co.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sagar";
const LS_LAST_RATE_KEY = "gold_last_rate_v1";
const REFRESH_INTERVAL_MS = 5000; 
const BLINK_MS = 1000;

function fmtInt(val) {
  if (val === null || val === undefined || isNaN(val) || val === 0) return "—";
  const n = Math.round(Number(val));
  return n.toLocaleString("en-IN");
}

function parseGoldRate(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const goldLine = lines.find((l) => /GOLD NAGPUR 99\.5 RTGS \(Rate 50 gm\)/i.test(l));
  
  if (!goldLine) throw new Error("Target product line not found in response");

  let extracted = null;
  const cols = goldLine.split(/\t+/).map((c) => c.trim()).filter(Boolean);
  const dashColIndex = cols.findIndex((c) => /^[-—]$/.test(c));

  if (dashColIndex !== -1 && cols.length > dashColIndex + 1) {
    const afterCols = cols.slice(dashColIndex + 1);
    const afterText = afterCols.join(" ");
    const m = afterText.match(/\d+(?:\.\d+)?/);
    if (m) extracted = m[0];
  }

  if (!extracted) {
    const dashPos = goldLine.indexOf("-");
    if (dashPos !== -1) {
      const after = goldLine.slice(dashPos + 1);
      const m = after.match(/\d+(?:\.\d+)?/);
      if (m) extracted = m[0];
    }
  }

  if (!extracted) {
    const allNums = goldLine.match(/\d+(?:\.\d+)?/g) || [];
    if (allNums.length) {
      extracted = allNums.reduce((a, b) => (parseFloat(b) > parseFloat(a) ? b : a), allNums[0]);
    }
  }

  if (!extracted) throw new Error("Could not parse numeric rate from GOLD line");
  return Number(extracted);
}

export default function JewelleryPricingTable({ makingVal = "5250" }) {
  // --- 1. Load Initial State from Cache ---
  const getCachedData = () => {
    try {
      const lastRaw = localStorage.getItem(LS_LAST_RATE_KEY);
      if (lastRaw) {
        const parsed = JSON.parse(lastRaw);
        if (parsed && Number.isFinite(parsed.rate)) return parsed;
      }
    } catch (e) { return null; }
    return null;
  };

  const cached = getCachedData();

  // --- 2. States ---
  const [rate, setRate] = useState(cached ? Number(cached.rate) : null);
  const [loading, setLoading] = useState(!cached);
  const [initialized, setInitialized] = useState(Boolean(cached));
  const [lastUpdated, setLastUpdated] = useState(cached?.ts ? new Date(Number(cached.ts)) : null);
  
  const [weight, setWeight] = useState("");
  const [carat, setCarat] = useState("22K");
  const [makingPercent, setMakingPercent] = useState("");
  
  const [isBlinking, setIsBlinking] = useState(false);
  const [blinkDir, setBlinkDir] = useState(null);

  // --- 3. Refs ---
  const initializedRef = useRef(Boolean(cached));
  const previousRateRef = useRef(cached ? Number(cached.rate) : null);
  const timerRef = useRef(null);
  const controllerRef = useRef(null);
  const blinkTimeoutRef = useRef(null);

  const caratOptions = ["24K", "22K", "20K", "18K", "16K"];
  const makingPercentOptions = ["10%", "12%", "3%", "3.50%", "5%"];

  // --- 4. Live Calculation ---
  const getDerivedRates = useCallback(() => {
    if (!rate) return { g10: 0, g1: 0 };
    const makingNumber = Number(makingVal) || 5250;
    let r10 = 0;
    
    if (carat === "24K") r10 = rate;
    else if (carat === "22K") r10 = (rate + makingNumber) / 1.1;
    else if (carat === "20K") r10 = rate / 1.1;
    else if (carat === "18K") r10 = (0.95 * rate) / 1.1;
    else if (carat === "16K") r10 = (0.85 * rate) / 1.1;
    
    return { g10: r10, g1: r10 / 10 };
  }, [rate, carat, makingVal]);

  const { g1: current1gRate, g10: current10gRate } = getDerivedRates();

  // --- 5. Core Fetch Function ---
  const fetchRate = useCallback(async (signal) => {
    if (!initializedRef.current) setLoading(true);

    try {
      const res = await fetch(`${ENDPOINT}?_=${Date.now()}`, { signal });
      const text = await res.text();
      const newRate = parseGoldRate(text);

      if (newRate) {
        if (previousRateRef.current !== null && newRate !== previousRateRef.current) {
          setBlinkDir(newRate > previousRateRef.current ? "up" : "down");
          setIsBlinking(true);
          
          if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
          blinkTimeoutRef.current = setTimeout(() => {
            setIsBlinking(false);
            setBlinkDir(null);
          }, BLINK_MS);
        }

        setRate(newRate);
        previousRateRef.current = newRate;
        const now = new Date();
        setLastUpdated(now);
        
        localStorage.setItem(LS_LAST_RATE_KEY, JSON.stringify({ rate: newRate, ts: now.getTime() }));
        
        setInitialized(true);
        initializedRef.current = true;
      }
    } catch (err) {
      if (err?.name !== "AbortError") console.error("Rate fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // --- 6. Lifecycle ---
  useEffect(() => {
    controllerRef.current = new AbortController();
    fetchRate(controllerRef.current.signal);

    timerRef.current = setInterval(() => {
      if (controllerRef.current) controllerRef.current.abort();
      controllerRef.current = new AbortController();
      fetchRate(controllerRef.current.signal);
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
      if (controllerRef.current) controllerRef.current.abort();
    };
  }, [fetchRate]);

  // --- Calculation Helpers ---
  const calculatePrice = (extraHallmark) => {
    const w = parseFloat(weight) || 0;
    if (w === 0 || current1gRate === 0) return "0";
    let m = makingPercent ? (w * current1gRate) * (parseFloat(makingPercent) / 100) : 0;
    return ((w * current1gRate + m + extraHallmark) * 1.03).toFixed(0);
  };

  const calculateGST = () => {
    const w = parseFloat(weight) || 0;
    if (w === 0 || current1gRate === 0) return "0";
    let m = makingPercent ? (w * current1gRate) * (parseFloat(makingPercent) / 100) : 0;
    return ((w * current1gRate + m + 100) * 0.03).toFixed(0);
  };

  let blinkClass = "border-neutral-700 bg-neutral-800/50";
  if (isBlinking) {
    blinkClass = blinkDir === "up" 
      ? "bg-green-500/20 border-green-500 animate-pulse" 
      : "bg-red-500/20 border-red-500 animate-pulse";
  }

  return (
    <div className="p-6 bg-neutral-900 text-white rounded-2xl shadow-xl max-w-5xl mx-auto space-y-6 border border-neutral-700">
      <h2 className="text-2xl font-bold text-amber-400 text-center uppercase tracking-wider">Live Gold Rates</h2>

      {/* Main Rate Card */}
      <div className={`p-5 text-center border rounded-xl transition-all duration-300 ${blinkClass}`}>
        {!initialized && loading ? (
          <p className="animate-pulse text-neutral-400">🔄 Loading Market Rates...</p>
        ) : (
          <div>
            <p className="text-sm font-bold text-amber-500 uppercase mb-2">Live {carat} Rate</p>
            <div className="flex justify-center space-x-12">
              <div className="text-center">
                <span className="block text-xs text-neutral-400 uppercase">Per 1 Gram</span>
                <span className={`text-3xl font-black transition-colors ${isBlinking ? 'text-white' : 'text-neutral-100'}`}>
                  ₹ {fmtInt(current1gRate)}
                </span>
              </div>
              <div className="text-center">
                <span className="block text-xs text-neutral-400 uppercase">Per 10 Gram</span>
                <span className={`text-3xl font-black transition-colors ${isBlinking ? 'text-white' : 'text-neutral-100'}`}>
                  ₹ {fmtInt(current10gRate)}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-neutral-500 mt-3 italic">
              Auto-updating every 5s • Last Sync: {lastUpdated?.toLocaleTimeString()}
            </p>
          </div>
        )}
      </div>

      {/* Pricing Table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-700">
        <table className="w-full text-left">
          <thead className="bg-neutral-800 text-[11px] uppercase text-neutral-400">
            <tr>
              <th className="p-3">Weight (g)</th>
              <th className="p-3">Carat</th>
              <th className="p-3">Rate/g</th>
              <th className="p-3">Making %</th>
              <th className="p-3 text-amber-500">Total (100H)</th>
              <th className="p-3 text-amber-500">Total (150H)</th>
              <th className="p-3 text-green-500">GST (3%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            <tr className="bg-neutral-900/50">
              <td className="p-3">
                <input 
                  type="number" 
                  value={weight} 
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-24 p-2 rounded-lg bg-neutral-800 border border-neutral-600 outline-none" 
                  placeholder="0.00" 
                />
              </td>
              <td className="p-3">
                <select 
                  value={carat} 
                  onChange={(e) => setCarat(e.target.value)} 
                  className="bg-neutral-800 p-1 outline-none rounded border border-neutral-600"
                >
                  {caratOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td className={`p-3 font-bold transition-colors ${isBlinking ? 'text-amber-400' : 'text-amber-200'}`}>
                ₹ {fmtInt(current1gRate)}
              </td>
              <td className="p-3">
                <select 
                  value={makingPercent} 
                  onChange={(e) => setMakingPercent(e.target.value)}
                  className="w-full p-1 rounded bg-neutral-800 border border-neutral-600 text-[10px]"
                >
                  <option value="">%</option>
                  {makingPercentOptions.map((mp) => <option key={mp} value={mp}>{mp}</option>)}
                </select>
              </td>
              <td className="p-3 text-amber-400 font-bold italic">₹{fmtInt(calculatePrice(100))}</td>
              <td className="p-3 text-amber-400 font-bold italic">₹{fmtInt(calculatePrice(150))}</td>
              <td className="p-3 text-green-400 font-bold text-xs">₹{fmtInt(calculateGST())}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex justify-end space-x-4">
        <button 
          onClick={() => {setWeight(""); setMakingPercent("");}} 
          className="px-6 py-2 bg-neutral-700 rounded-lg font-bold hover:bg-neutral-600 transition-colors cursor-pointer"
        >
          Reset
        </button>
        <button 
          onClick={() => fetchRate()} 
          className="px-6 py-2 bg-amber-500 text-neutral-900 rounded-lg font-bold active:scale-95 hover:bg-amber-400 transition-all cursor-pointer"
        >
          {loading ? "Updating..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}




