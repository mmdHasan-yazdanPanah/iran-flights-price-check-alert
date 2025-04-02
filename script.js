const { default: axios } = require('axios');
const { execSync } = require('child_process');
const { default: inquirer } = require('inquirer');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

let date = '2025-04-07';
let interval = 600; // 10min
let selectedFlights = {};
let asked = false;

async function askQuestion(flights) {
  const choices = flights.map((item) => ({
    value: item.Id,
    name: flightNameMaker(item),
  }));

  const answers = await inquirer.prompt([
    {
      type: 'checkbox', // Use 'list' for single selection, 'checkbox' for multiple
      name: 'selectedOptions',
      message: 'Which flights I Prioritize?',
      choices: choices,
    },
  ]);

  answers.selectedOptions.forEach((id) => {
    const selectedFlight = flights.find((item) => item.Id === id);
    selectedFlights[id] = { value: selectedFlight, present: true };
  });
  Object.keys(selectedFlights).forEach((id) => {
    console.log(flightNameMaker(selectedFlights[id].value));
  });
  asked = true;
  return;
}

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

function flightGetPrice(flight) {
  let price = 0;
  let cap = 0;

  const prices = flight.Prices[0];
  if (prices) {
    const PassengerFares = prices.PassengerFares;
    const adlPasanger = PassengerFares.find((item) => item.PaxType === 'ADL');
    price = adlPasanger.TotalFare;
    cap = prices.Capacity;
  }
  return { price, cap };
}

function flightHandler(flight, prevMinPrice, prevCap, title) {
  const { price: adlPrice, cap } = flightGetPrice(flight);

  if (prevCap !== cap) {
    toastHandler(
      `Cap Changed`,
      `CapBefore:${prevCap} - ${flightNameMaker(flight)}`
    );
  }

  if (prevMinPrice === adlPrice) {
    return;
  }

  if (adlPrice > minPrice) {
    increaseHandler(flight, adlPrice, title);
  } else {
    decreaseHandler(flight, adlPrice, title);
  }
}

function minFlightHandler(flight) {
  const { cap, price } = flightGetPrice(flight);
  flightHandler(flight, minPrice, cap, 'Min Price Changed!!');
  const { price: adlPrice } = flightGetPrice(flight);
  minFlight = flight;
  minPrice = adlPrice;
  notFound = false;
}

function flightNameMaker(flight) {
  const leg = flight.Segments[0]?.Legs[0];
  const departureTime = leg?.DepartureTime;
  const dateString = leg.DepartureDateString;
  const d = new Date(departureTime);
  const time = d.toLocaleTimeString('en-IR');
  const { price, cap } = flightGetPrice(flight);

  return `Date:${dateString} Time: ${time} - Cap: ${cap}`;
}

function infoTextMaker(flight, price) {
  const name = flightNameMaker(flight);

  return `Old(${(minPrice / 10).toLocaleString()}) New(${(
    price / 10
  ).toLocaleString()}) || ${name}`;
}

function increaseHandler(flight, price, title) {
  const info = infoTextMaker(flight, price);
  if (info) {
    toastHandler(`${title} Up👆👆`, info);
  }
}

function decreaseHandler(flight, price, title) {
  const info = infoTextMaker(flight, price);
  if (info) {
    toastHandler(`${title} Dowm👇👇`, info);
  }
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
    .then(async (res) => {
      const filteredFlights = res.data.Flights.filter(
        (item) => item.Prices?.length > 0
      );
      const newMinFlight = filteredFlights[0];

      if (newMinFlight) {
        if (!asked) {
          await askQuestion(filteredFlights);
        }
        const selctedFlightKeys = Object.keys(selectedFlights);
        if (selctedFlightKeys.length) {
          selctedFlightKeys.forEach((selectedId) => {
            const finded = filteredFlights.find(
              (item) => item.Id === selectedId
            );
            const selectedFlight = selectedFlights[selectedId];

            if (finded) {
              let title = 'Now Available';
              let price = 0;
              let cap = 0;
              if (selectedFlight.present) {
                title = '';
                price = flightGetPrice(selectedFlight.value).price;
                cap = flightGetPrice(selectedFlight.value).cap;
              }
              flightHandler(finded, price, cap, title);
              selectedFlights[selectedId].present = true;
              selectedFlights[selectedId].value = finded;
            } else {
              toastHandler('Finished', flightNameMaker(selectedFlight.value));
              selectedFlights[selectedId].present = false;
            }
          });
        }
        minFlightHandler(newMinFlight);
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
