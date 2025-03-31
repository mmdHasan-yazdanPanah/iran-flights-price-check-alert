const { default: axios } = require('axios');
const { execSync } = require('child_process');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

let date = '2025-04-07';
let interval = 600; // 10min

function isValidStrictDate(dateString) {
  // First check the exact format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;

  // Parse the components
  const parts = dateString.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  // Check basic ranges
  if (year < 1000 || year > 9999 || month < 1 || month > 12) return false;

  // Create a date object and verify it matches the input
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

readline.question(
  'Please enter the date or hit enter for default(2025-04-07): ',
  (readDate) => {
    if (readDate) {
      if (!isValidStrictDate(readDate)) {
        console.log(`Date is Invalid!! ❌`);
        readline.close();
        return;
      } else {
        date = readDate;
      }
    }
    console.log(`Using date: ${date}`);

    readline.question('Interval - Default(600 => 10min): ', (readInterval) => {
      if (readInterval && !isNaN(+readInterval)) {
        interval = readInterval;
      }
      console.log(`Interval: ${interval}`);
      checkData(date);

      readline.close();
    });
  }
);

let minPrice = 0;
let minFlight;
let notFound = false;

function notFoundHandler() {
  console.log('Not Found');
  if (notFound === false) {
    toastHandler('Not Found', date);
  }
  notFound = true;
  minPrice = 0;
  minFlight = null;
}

function toastHandler(title, content) {
  try {
    // Method 1: Direct command execution (most reliable)
    console.log(title, content);
    execSync(
      `termux-notification --title "${title}" --content "${content}" --sound`
    );

    // Method 2: Alternative using termux package (if installed)
    /* termux.notification({
      title: '✅ Test Successful!',
      content: 'Your Termux setup works perfectly!',
      sound: true, // Makes your phone ding
    }); */
  } catch (error) {
    console.error('Notification failed:', error.message);
  }
}

function flightHandler(flight) {
  const prices = flight.Prices[0];
  if (!prices) {
    notFoundHandler();
    return;
  }

  const PassengerFares = prices.PassengerFares;
  if (!PassengerFares) {
    notFoundHandler();
    return;
  }

  notFound = false;

  const adlPasanger = PassengerFares.find((item) => item.PaxType === 'ADL');
  const adlPrice = adlPasanger.TotalFare;

  if (minPrice === adlPrice) {
    return;
  }

  if (adlPrice > minPrice) {
    increaseHandler(flight, adlPrice);
  } else {
    decreaseHandler(flight, adlPrice);
  }
}

function infoTextMaker(flight, price) {
  const leg = flight.Segments[0]?.Legs[0];
  if (!leg) return notFoundHandler();
  const departureTime = leg?.DepartureTime;
  const dateString = leg.DepartureDateString;

  const d = new Date(departureTime);
  const time = d.toLocaleTimeString('en-IR');

  return `Old(${(minPrice / 10).toLocaleString()}) New(${(
    price / 10
  ).toLocaleString()}) || Date:${dateString} Time: ${time}`;
}

function increaseHandler(flight, price) {
  const info = infoTextMaker(flight, price);
  if (info) {
    toastHandler('Up👆👆', info);
  }
  minFlight = flight;
  minPrice = price;
  notFound = false;
}

function decreaseHandler(flight, price) {
  const info = infoTextMaker(flight, price);
  if (info) {
    toastHandler('Dowm👇👇', info);
  }
  minFlight = flight;
  minPrice = price;
  notFound = false;
}

function checkData(checkDate) {
  console.log('Fetch', new Date().toString());
  axios
    .post('https://flight.atighgasht.com/api/Flights', {
      AdultCount: 1,
      ChildCount: 0,
      InfantCount: 0,
      CabinClass: 'All',
      Routes: [
        {
          OriginCode: 'BUZ',
          DestinationCode: 'THR',
          DepartureDate: checkDate,
        },
      ],
      Baggage: true,
    })
    .then((res) => {
      const filteredFlights = res.data.Flights.filter(
        (item) => item.Prices?.length > 0
      );
      const newMinFlight = filteredFlights[0];

      if (newMinFlight) {
        flightHandler(newMinFlight);
      } else {
        notFoundHandler();
      }
    })
    .catch((err) => {
      toastHandler('Error in Fetch ❌', '');
      console.log(err);
    })
    .finally(() => {
      setTimeout(() => checkData(date), interval * 1000);
    });
}
