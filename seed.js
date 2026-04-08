const bcrypt = require('bcrypt');
const { syncDB, User, Equipment } = require('./models/db');

async function seed() {
  await syncDB();
  
  // Check if provider exists
  let provider = await User.findOne({ where: { email: 'provider@test.com' } });
  
  if (!provider) {
    const passwordHash = await bcrypt.hash('password123', 10);
    provider = await User.create({
      name: 'Agri Corp Rentals',
      mobile: '9876543210',
      email: 'provider@test.com',
      passwordHash,
      role: 'provider',
      location: 'Nagpur District'
    });
    console.log('Created mock provider account.');
  }

  // Create equipment
  const eqData = [
    { name: 'John Deere 5310', type: 'Tractor', pricePerHour: 800, location: 'Dahegaon', status: 'Available' },
    { name: 'Mahindra Arjun Novo', type: 'Tractor', pricePerHour: 750, location: 'Samudrapur', status: 'Available' },
    { name: 'Swaraj 744 FE', type: 'Tractor', pricePerHour: 650, location: 'Waygaon', status: 'Available' },
    { name: 'Kubota Harvester DC-68G', type: 'Harvester', pricePerHour: 1500, location: 'Renkapur', status: 'Available' },
    { name: 'Massey Ferguson 241', type: 'Tractor', pricePerHour: 600, location: 'Hirdi', status: 'Available' }
  ];

  for (let eq of eqData) {
    await Equipment.create({ ...eq, providerId: provider.id });
  }

  console.log('Successfully added mock equipment!');
  process.exit(0);
}

seed().catch(console.error);
