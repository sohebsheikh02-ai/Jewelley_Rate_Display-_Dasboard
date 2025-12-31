import { useState } from 'react';
import './App.css'
import GoldLiveRatesComponentOld from './Components/GoldLiveRatesComponentOld'
import GoldLiveRatesComponent from './Components/GoldLiveRatesComponent'
import JewelleryPricingTable from './Components/JewelleryPricingTable';



function App() {


  const [rate22K10gm, setRate22K10gm] = useState(0);
  const [rate20K10gm, setRate20K10gm] = useState(0);
  const [rate18K10gm, setRate18K10gm] = useState(0);
  const [rate16K10gm, setRate16K10gm] = useState(0);

  return (
    <>
      <GoldLiveRatesComponent 
        logoSrc="../prk.png"
        shopName = 'प्रमोद रामभाऊ काळे ज्वेलर्स' 
        shopImageSrc = "../प्रमोद रामभाऊ काळे ज्वेलर्स, पुलगांव.png"
        shopSalutation = "../Layer.png"
        defaultRefreshSeconds = {5}

         onRatesUpdate={(rates) => {
          setRate22K10gm(rates.rate22K10gm);
          setRate20K10gm(rates.rate20K10gm);
          setRate18K10gm(rates.rate18K10gm);
          setRate16K10gm(rates.rate16K10gm);
        }}
      /> 
      <JewelleryPricingTable />
    </>
  )
}


// function App() {

//   return (
//     <>
//       <GoldLiveRatesComponentOld 
//         logoSrc="../prk.png"
//         shopName = 'Pramod Jewellers' 
//         defaultRefreshSeconds = {60}
//       />      
//     </>
//   )
// }

export default App
