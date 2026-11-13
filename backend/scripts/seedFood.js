require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const FoodItem = require('../models/FoodItem');

const groups = [
['Drinks','ड्रिंक',[
['Chai','चाय',20,'☕',1],
['Coffee','कॉफी',40,'☕',1],
['Nimbu Pani','नीबू पानी',25,'🍋',1],
['Mineral Water','मिनरल वाटर',null,'💧',1],
['Cold Drink','कोल्ड ड्रिंक',null,'🥤',1],
['Dahi','दही',30,'🥛',1]
]],
['Pakoda','पकौड़ा',[
['Pyaaz Pakoda','प्याज पकौड़ा',70,'🧅',1],
['Paneer Pakoda','पनीर पकौड़ा',100,'🧀',1],
['Kela Pakoda','केला पकौड़ा',50,'🍌',1]
]],
['Snacks','स्नैक्स',[
['Boiled Anda','ब्याल अण्डा',40,'🥚',0],
['Chhola Bhatura','छोला भटूरा',80,'🍛',1],
['Finger Chips','फिंगर चिप्स',60,'🍟',1],
['Poori Sabzi','पूरी सब्जी',80,'🍽️',1]
]],
['Chinese Zone','चाइनीज जोन',[
['Veg Chowmein','वेज चाउमीन',[50,90],'🍜',1],
['Paneer Chowmein','पनीर चाउमीन',[90,170],'🍜',1],
['Maggi','मैगी',50,'🍜',1],
['Veg Manchurian','वेज मैन्चुरियन',[70,120],'🥘',1],
['Paneer Manchurian','पनीर मैन्चुरियन',[90,180],'🥘',1],
['Anda Chowmein','अण्डा चाउमीन',[90,170],'🍜',0],
['Chicken Chowmein','चिकन चाउमीन',[120,200],'🍜',0],
['Chicken Chilli','चिकन चिल्ली',[180,320],'🍗',0],
['Paneer Chilli','पनीर चिल्ली',[90,180],'🧀',1],
['Chilli Potato','चिल्ली पोटैटो',[80,140],'🥔',1],
['Chicken Manchurian','चिकन मैन्चुरियन',[270,500],'🍗',0],
['Burger Sada','बर्गर सादा',40,'🍔',1],
['Paneer Burger','पनीर बर्गर',80,'🍔',1]
]],
['Fried Rice','फ्राइड राईस',[
['Veg Fried Rice','वेज फ्राइड राइस',[80,160],'🍚',1],
['Paneer Fried Rice','पनीर फ्राइड राइस',[100,180],'🍚',1],
['Chicken Fried Rice','चिकन फ्राइड राइस',[120,200],'🍚',0],
['Anda Fried Rice','अण्डा फ्राइड राइस',[110,180],'🍚',0]
]],
['Roti / Paratha','रोटी / पराठा',[
['Tawa Roti','तवा रोटी',12,'🫓',1],
['Tawa Butter Roti','तवा बटर रोटी',15,'🫓',1],
['Paneer Paratha','पनीर पराठा',120,'🫓',1],
['Aloo Paratha','आलू पराठा',80,'🫓',1],
['Gobhi Paratha','गोभी पराठा',80,'🫓',1],
['Sada Paratha','सादा पराठा',30,'🫓',1],
['Lachha Paratha','लच्छा पराठा',40,'🫓',1]
]],
['Rice','राईस',[
['Steam Rice','स्टीम राइस',[50,90],'🍚',1],
['Jeera Rice','जीरा राइस',[60,120],'🍚',1],
['Matar Rice','मटर राइस',[70,120],'🍚',1],
['Veg Pulao','वेज पुलाव',[80,140],'🍚',1]
]],
['Dal','दाल',[
['Butter Dal','बटर दाल',[80,130],'🥣',1],
['Plain Dal','प्लेन दाल',[50,90],'🥣',1],
['Dal Tadka','दाल तड़का',[70,120],'🥣',1],
['Dal Fry','दाल फ्राई',[70,120],'🥣',1]
]],
['Roll','रोल',[
['Veg Roll','वेज रोल',50,'🌯',1],
['Paneer Roll','पनीर रोल',100,'🌯',1],
['Chicken Roll','चिकन रोल',120,'🌯',0],
['Anda Roll','अण्डा रोल',100,'🌯',0]
]],
['Soup','सूप',[
['Veg Soup','वेज सूप',60,'🥣',1],
['Chicken Soup','चिकन सूप',95,'🥣',0],
['Manchow Soup','मनचाऊ सूप',70,'🥣',1],
['Anda Soup','अण्डा सूप',70,'🥣',0]
]],
['Biryani','बिरयानी',[
['Veg Biryani','वेज बिरयानी',[90,180],'🍛',1],
['Chicken Biryani','चिकन बिरयानी',[130,250],'🍗',0],
['Anda Biryani','अण्डा बिरयानी',[100,180],'🍚',0]
]],
['Anda Special','अण्डा स्पेशल',[
['Anda Curry','अण्डा करी',[110,180],'🥚',0],
['Anda Bhujia','अण्डा भुजिया',[70,140],'🍳',0],
['Anda Masala','अण्डा मसाला',120,'🍳',0]
]],
['Sabzi','सब्जी',[
['Matar Paneer','मटर पनीर',[100,180],'🥘',1],
['Handi Paneer','हाण्डी पनीर',[110,200],'🥘',1],
['Kadhai Paneer','कढ़ाई पनीर',[110,200],'🥘',1],
['Paneer Butter Masala','पनीर बटर मसाला',[120,220],'🥘',1],
['Paneer Do Pyaza','पनीर दो प्याजा',[110,210],'🥘',1],
['Shahi Paneer','शाही पनीर',[110,200],'🥘',1],
['Paneer Bhurji','पनीर भुज्जी',[90,180],'🥘',1],
['Mushroom Masala','मसरूम मसाला',[100,180],'🍄',1],
['Mushroom Do Pyaza','मसरूम दो प्याजा',[100,180],'🍄',1],
['Mushroom Kadhai','मसरूम कढ़ाई',[100,180],'🍄',1],
['Aloo Jeera','आलू जीरा',[60,100],'🥔',1],
['Mix Veg','मिक्स वेज',[70,140],'🥦',1],
['Aloo Banarasi','आलू बनारसी',[120,220],'🥔',1],
['Aloo Matar/Soya/Parwal','आलू मटर, सोया, परवर',[70,120],'🥔',1],
['Aloo Gobhi','आलू गोभी',[70,120],'🥔',1]
]],
['Chicken Curry','चिकन करी',[
['Chicken Curry','चिकन करी',[120,230],'��',0],
['Chicken Handi','चिकन हाण्डी',[130,240],'��',0],
['Kadhai Chicken','कढ़ाई चिकन',[130,240],'��',0],
['Chicken Do Pyaza','चिकन दो प्याजा',[130,240],'🍗',0]
]],
['Papad / Salad / Raita','पापड़ / सलाद / रायता',[
['Salad','सलाद',70,'🥗',1],
['Papad','पापड़',20,'🫓',1],
['Fry Papad','फ्राई पापड़',25,'🫓',1],
['Veg Raita','वेज रायता',30,'🥣',1],
['Boondi Raita','बुंदी रायता',40,'🥣',1]
]],
['Thali','थाली',[
['Special Thali','स्पेशल थाली',250,'🍱',1,['Dal','Matar Paneer','Raita','Seasonal Veg','Chawal','Papad','Gulab Jamun','Salad','Roti','Achar']],
['Sada Thali','सादा थाली',150,'🍱',1,['Dal','Chawal','Raita','Seasonal Veg','Roti','Achar','Salad']]
]]
];

const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

async function seedFood() {
  try {
    await connectDB();
    const items = [];

    for (const [category, categoryHindi, entries] of groups) {
      for (const entry of entries) {
        const [name, hindiName, rate, emoji, veg, ingredients = []] = entry;
        const item = {
          itemId: slug(category + '-' + name),
          name, hindiName, category, categoryHindi, emoji,
          isVegetarian: Boolean(veg),
          isAvailable: rate !== null,
          ingredients
        };

        if (Array.isArray(rate)) {
          item.price = null;
          item.priceOptions = { half: rate[0], full: rate[1] };
        } else {
          item.price = rate;
          item.priceOptions = {};
        }
        items.push(item);
      }
    }

    await FoodItem.deleteMany({});
    await FoodItem.insertMany(items);

    console.log('Food menu seeded successfully.');
    console.log('Categories:', groups.length);
    console.log('Total menu items:', items.length);
    console.log('Items without supplied price:', items.filter(i => i.price === null && !i.priceOptions.half).map(i => i.name));
    console.log('Half/full items:', items.filter(i => i.priceOptions.half).length);
    console.log('Thali ingredients:', items.filter(i => i.ingredients.length));
  } catch (error) {
    console.error('Food seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedFood();
