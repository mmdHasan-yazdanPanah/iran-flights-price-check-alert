import axios from 'axios';
import { execSync } from 'child_process';
import inquirer from 'inquirer';
import dns from 'dns';
import moment from 'moment-jalaali';
import chalk from 'chalk';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const persianToEnglishMonths = {
  فروردین: 'Farvardin',
  اردیبهشت: 'Ordibehesht',
  خرداد: 'Khordad',
  تیر: 'Tir',
  مرداد: 'Mordad',
  شهریور: 'Shahrivar',
  مهر: 'Mehr',
  آبان: 'Aban',
  آذر: 'Azar',
  دی: 'Dey',
  بهمن: 'Bahman',
  اسفند: 'Esfand',
};

function replacePersianMonths(str) {
  const monthKeys = Object.keys(persianToEnglishMonths); // Get the keys (Persian month names)
  const regex = new RegExp(monthKeys.join('|'), 'g'); // Create a dynamic regex from the keys

  return str.replace(regex, (match) =>
    chalk.blue(persianToEnglishMonths[match])
  );
}

let date = '1404/01/18';
let interval = 600; // 10min
let selectedFlights = {};
let asked = false;
// const connectionTimeOut = 10 * 60 * 1000;
const connectionTimeOut = 20 * 1000;

moment.loadPersian(); // بارگذاری تقویم فارسی

function jallaliToMilladi(jalaliDate) {
  // return moment(jalaliDate, 'jYYYY/jMM/jDD').format('DD-MM-YYYY');
  return moment(jalaliDate, 'jYYYY/jMM/jDD').format('YYYY-MM-DD');
}

async function askQuestion(flights) {
  const choices = flights.map((item) => ({
    value: item.Id,
    name: replacePersianMonths(flightNameMaker(item)),
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

rl.question(
  `Please enter the date or hit enter for default(${date}): `,
  (readDate) => {
    if (readDate.length > 2) {
      date = readDate;
    }
    console.log(`Using date: ${date}`);

    rl.question('Interval - Default(600 => 10min): ', (readInterval) => {
      if (readInterval && !isNaN(+readInterval)) {
        interval = readInterval;
      }
      console.log(`Interval: ${interval}`);
      checkData(date);

      rl.close();
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
    console.log(replacePersianMonths(title), replacePersianMonths(content));
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

// Function to check for an internet connection
function checkInternetConnection(timeout = connectionTimeOut) {
  // 10 minutes timeout
  return new Promise((resolve) => {
    let startTime = Date.now();
    let logged = false;

    const check = () => {
      dns.lookup('google.com', (err) => {
        if (!err) {
          let duration = Math.round((Date.now() - startTime) / 1000);
          if (logged) {
            toastHandler(
              'Connection established',
              `Connection established after ${duration} seconds`
            );
          }
          clearInterval(interval);
          clearTimeout(timeoutID);
          resolve();
        }
      });
    };

    // Check every 5 seconds
    const interval = setInterval(check, 5000);

    // Log after 10 minutes if still offline
    const timeoutID = setTimeout(() => {
      if (!logged) {
        let duration = Math.round((Date.now() - startTime) / 1000);
        toastHandler(
          'No internet connection',
          `No internet connection in ${duration} seconds`
        );
        logged = true;
      }
    }, timeout);
  });
}

async function checkData(checkDate) {
  console.log('Fetch', new Date().toString());

  await checkInternetConnection();

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
          DepartureDate: jallaliToMilladi(checkDate),
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
      console.log(err.message);
    })
    .finally(() => {
      setTimeout(() => checkData(date), interval * 1000);
    });
}
