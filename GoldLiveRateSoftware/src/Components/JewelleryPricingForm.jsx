import React, { useState, useEffect, useRef, useCallback } from "react";

// --- API and Constants ---
const ENDPOINT =
  "https://bcast.sagarjewellers.co.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sagar?_=1761132425086";
const LS_LAST_RATE_KEY = "gold_last_rate_v1";
const REFRESH_INTERVAL_MS = 5000; // Fetch every 5 seconds
const BLINK_MS = 900;
// -------------------------

// --- Carat Purity Multipliers ---
// Purity is calculated as Carat/24
const CARAT_MULTIPLIERS = {
    "24K": 1.0,      // 24/24 = 100%
    "22K": 0.9167,   // 22/24 ≈ 91.67%
    "20K": 0.8333,   // 20/24 ≈ 83.33%
    "18K": 0.75,     // 18/24 = 75%
    "16K": 0.6667,   // 16/24 ≈ 66.67%
};
// --------------------------------

// Helper function for formatting
function fmtDecimal(val, decimals = 2) {
    if (val === null || val === undefined || Number.isNaN(val)) return "—";
    const n = Number(val);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
}

// Helper to extract the 50g rate from the complex response string
function parseGoldRate(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const goldLine = lines.find((l) =>
    /GOLD NAGPUR 99\.5 RTGS \(Rate 50 gm\)/i.test(l)
  );

  if (!goldLine) return null;

  let extracted = null;
  const cols = goldLine.split(/\t+/).map((c) => c.trim()).filter(Boolean);
  const dashColIndex = cols.findIndex((c) => /^[-—]$/.test(c));

  if (dashColIndex !== -1 && cols.length > dashColIndex + 1) {
    const afterCols = cols.slice(dashColIndex + 1);
    const afterText = afterCols.join(" ");
    const m = afterText.match(/\d+(?:\.\d+)?/);
    if (m) extracted = m[0];
  } else {
    const allNums = goldLine.match(/\d+(?:\.\d+)?/g) || [];
    if (allNums.length) {
      extracted = allNums.reduce(
        (a, b) => (parseFloat(b) > parseFloat(a) ? b : a),
        allNums[0]
      );
    }
  }

  return extracted ? Number(extracted) : null;
}


export default function JewelleryPricingTable() {
  // --- Price Calculator State (Original) ---
  const [weight, setWeight] = useState("");
  const [carat, setCarat] = useState("22K"); // Default carat is 22K
  const [making, setMaking] = useState("");
  const [makingPercent, setMakingPercent] = useState("");

  const makingValues = [2885, 2380, 2952, 2560];
  const makingPercentOptions = ["10%", "12%", "3%", "3.50%", "5%"]; 
  // Added 24K to options list for completeness in calculation
  const caratOptions = ["22K", "20K", "18K", "16K"]; 

  // --- Live Rate State (New) ---
  const [rate50g, setRate50g] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blinkRateDir, setBlinkRateDir] = useState(null); 
  const [lastUpdated, setLastUpdated] = useState(null); 
  
  // Refs for managing timers and state outside of render cycle
  const previousRateRef = useRef(null);
  const timeoutRef = useRef(null);
  const controllerRef = useRef(null);
  const blinkTimeoutRef = useRef(null);
  const isInitialLoadRef = useRef(true); 

  // --- Data Fetching Logic (Unchanged from corrected version) ---
  const clearSchedules = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
    if (controllerRef.current) controllerRef.current.abort();
  };
  
  const scheduleNextFetch = useCallback(() => {
    clearSchedules();
    timeoutRef.current = setTimeout(() => {
      controllerRef.current = new AbortController();
      fetchRate(controllerRef.current.signal);
    }, REFRESH_INTERVAL_MS);
  }, []);

  const triggerBlink = useCallback((prevVal, curVal) => {
    if (!Number.isFinite(prevVal) || !Number.isFinite(curVal)) return;
    const p = Number(prevVal);
    const c = Number(curVal);

    if (c > p) {
      setBlinkRateDir("up");
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
      blinkTimeoutRef.current = setTimeout(() => setBlinkRateDir(null), BLINK_MS);
    } else if (c < p) {
      setBlinkRateDir("down");
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
      blinkTimeoutRef.current = setTimeout(() => setBlinkRateDir(null), BLINK_MS);
    }
  }, []);

  const fetchRate = useCallback(async (signal) => {
    if (isInitialLoadRef.current) {
        setLoading(true);
    } else {
        setError(null);
    }

    try {
      const res = await fetch(ENDPOINT, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      const numericGold = parseGoldRate(text);
      
      if (!numericGold || !Number.isFinite(numericGold)) {
        throw new Error("Could not parse valid rate.");
      }

      const prev = previousRateRef.current;
      
      if (prev !== null && !isInitialLoadRef.current) {
        triggerBlink(prev, numericGold);
      }

      setRate50g(numericGold);
      previousRateRef.current = numericGold;

      try {
        localStorage.setItem(LS_LAST_RATE_KEY, JSON.stringify({ rate: numericGold }));
      } catch (e) { /* ignore */ }
      
      setLastUpdated(new Date()); 
      setLoading(false);
      isInitialLoadRef.current = false;
      scheduleNextFetch(); 

    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error("Fetch error:", err);
      setError("Failed to fetch rate");
      setLoading(false);
      isInitialLoadRef.current = false;
      scheduleNextFetch(); 
    }
  }, [scheduleNextFetch, triggerBlink]); 

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_LAST_RATE_KEY);
      const cached = raw ? JSON.parse(raw) : null;
      if (cached && Number.isFinite(cached.rate)) {
        previousRateRef.current = Number(cached.rate);
        setRate50g(Number(cached.rate));
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    } catch (e) { /* ignore */ }

    controllerRef.current = new AbortController();
    fetchRate(controllerRef.current.signal);

    return () => {
      clearSchedules();
    };
  }, [fetchRate]); 

  // --- Calculations and Derived Values (UPDATED) ---

  // Base 24K rate per gram from API (50g rate / 50)
  const base24KRatePerGram = rate50g ? rate50g / 50 : null;

  // Function to calculate the rate based on selected carat
  const getCaratRatePerGram = (selectedCarat) => {
      if (!base24KRatePerGram) return null;
      // Find the appropriate multiplier, defaulting to 1 (24K) if not found.
      const multiplier = CARAT_MULTIPLIERS[selectedCarat] || 1.0;
      return base24KRatePerGram * multiplier;
  };
  
  // Rate for the selected Carat
  const currentCaratRatePerGram = getCaratRatePerGram(carat);
  const displayRate = fmtDecimal(currentCaratRatePerGram, 2);

  const calculatePrice = (extraHallmark) => {
    const w = parseFloat(weight) || 0;
    // IMPORTANT: Use the current carat rate for pricing calculation
    const r = parseFloat(currentCaratRatePerGram) || 0; 
    const m = parseFloat(making) || 0;

    const base = w * r + m + extraHallmark;
    return (base * 1.03).toFixed(2);
  };

  const calculateGST = () => {
    const w = parseFloat(weight) || 0;
    // IMPORTANT: Use the current carat rate for GST calculation
    const r = parseFloat(currentCaratRatePerGram) || 0; 
    const m = parseFloat(making) || 0;

    return ((w * r + m + 100) * 0.03).toFixed(2);
  };

  // Rates to display based on selected carat
  const rate1Gram = fmtDecimal(currentCaratRatePerGram, 2);
  const rate10Gram = fmtDecimal(currentCaratRatePerGram * 10, 2);

  // Determine the Tailwind class for the blinking effect
  let blinkClass = "";
  if (blinkRateDir === "up") {
    blinkClass = "bg-green-500/50 animate-pulse border-green-400";
  } else if (blinkRateDir === "down") {
    blinkClass = "bg-red-500/50 animate-pulse border-red-400";
  }


  // --- Render ---

  return (
    <div className="p-6 bg-neutral-900 text-white rounded-2xl shadow-xl max-w-4xl mx-auto space-y-6 border border-neutral-700">
      <h2 className="text-2xl font-bold text-amber-400 text-center">Jewellery Pricing Table</h2>
      
      {/* Input Row for Carat Selection */}
      <div className="flex justify-center items-center space-x-4 mb-4">
            <label htmlFor="carat-select" className="font-semibold text-neutral-300">Select Carat for Rate Display:</label>
            <select
                id="carat-select"
                value={carat}
                onChange={(e) => setCarat(e.target.value)}
                className="p-2 rounded-xl bg-neutral-800 border border-neutral-600 focus:border-amber-400 focus:outline-none"
            >
                {caratOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                ))}
            </select>
        </div>


      {/* Live Rate Display Section (UPDATED) */}
      <div className={`p-3 text-center border rounded-xl transition-all ${blinkClass} border-neutral-700`}>
        {loading ? (
          <p className="text-lg font-semibold text-neutral-400">
            <span className="animate-spin inline-block mr-2">🔄</span> Loading Live Rate...
          </p>
        ) : error ? (
          <p className="text-lg font-semibold text-red-500">
            <span className="mr-2">❌</span> Error: {error}
          </p>
        ) : (
          <div>
            <p className="text-2xl font-extrabold text-amber-400 mb-2">
                Live Rate for Selected Carat ({carat})
            </p>
            <div className="flex justify-center space-x-8">
                <p className="text-xl font-bold text-white">
                    1 Gram: <span className="text-green-400">₹ {rate1Gram}</span>
                </p>
                <p className="text-xl font-bold text-white">
                    10 Gram: <span className="text-green-400">₹ {rate10Gram}</span>
                    {blinkRateDir && (
                      <span className={`ml-2 text-xl ${blinkRateDir === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                        {blinkRateDir === 'up' ? '▲' : '▼'}
                      </span>
                    )}
                </p>
            </div>
            <span className="text-xs text-neutral-500 block mt-2">
                Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '...'} | Refreshes automatically
            </span>
          </div>
        )}
      </div>
      
      <table className="w-full border-collapse border border-neutral-700 text-left">
        <thead>
          <tr className="bg-neutral-800">
            <th className="p-3 border border-neutral-700">Weight (g)</th>
            <th className="p-3 border border-neutral-700">Carat</th>
            <th className="p-3 border border-neutral-700">Rate/Gram</th>
            <th className="p-3 border border-neutral-700">Making Charge</th>
            <th className="p-3 border border-neutral-700">Making %</th>
            <th className="p-3 border border-neutral-700">₹100 Hallmark Price</th>
            <th className="p-3 border border-neutral-700">₹150 Hallmark Price</th>
            <th className="p-3 border border-neutral-700">GST (3%)</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td className="p-3 border border-neutral-700">
              <input
                type="number"
                step="0.01"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full p-2 rounded-xl bg-neutral-800 border border-neutral-600 focus:border-amber-400 focus:outline-none"
              />
            </td>

            {/* Carat dropdown for calculation input */}
            <td className="p-3 border border-neutral-700">
              <select
                value={carat}
                onChange={(e) => setCarat(e.target.value)}
                className="w-full p-2 rounded-xl bg-neutral-800 border border-neutral-600 focus:border-amber-400 focus:outline-none"
              >
                {caratOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </td>

            {/* Display the selected carat rate per gram */}
            <td className={`p-3 border border-neutral-700 font-bold ${blinkClass}`}>
              {rate1Gram}
            </td>

            <td className="p-3 border border-neutral-700">
              <select
                value={making}
                onChange={(e) => setMaking(e.target.value)}
                className="w-full p-2 rounded-xl bg-neutral-800 border border-neutral-600 focus:border-amber-400 focus:outline-none"
              >
                <option value="">Select</option>
                {makingValues.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </td>

            <td className="p-3 border border-neutral-700">
              <select
                value={makingPercent}
                onChange={(e) => setMakingPercent(e.target.value)}
                className="w-full p-2 rounded-xl bg-neutral-800 border border-neutral-600 focus:border-amber-400 focus:outline-none"
              >
                <option value="">Select</option>
                {makingPercentOptions.map((mp) => (
                  <option key={mp} value={mp}>{mp}</option>
                ))}
              </select>
            </td>

            <td className="p-3 border border-neutral-700 text-amber-400 font-bold">₹ {calculatePrice(100)}</td>
            <td className="p-3 border border-neutral-700 text-amber-400 font-bold">₹ {calculatePrice(150)}</td>
            <td className="p-3 border border-neutral-700 text-green-400 font-bold">₹ {calculateGST()}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}