export interface Product {
  id: string;
  name: string;
  category: 'robotics' | 'wearable' | 'ai' | 'electronics' | 'mechatronics' | 'hardware' | 'taptag' | 'web';
  tag: string;
  tagline: string;
  description: string;
  price?: string;
  priceNum?: number;
  image: string;
  specs: string[];
  features: string[];
  badge?: string;
  accentColor: string;
  iconName: string;
  highlightStat: { label: string; value: string };
  orderWaText: string;
}

import { asset } from '../lib/asset';

const RAW_PRODUCTS: Product[] = [
  {
    id: 'wifi-car',
    name: 'Autonomous Robotics Platform',
    category: 'robotics',
    tag: '01 · Mobile Robotics',
    tagline: 'Sensor-driven autonomous rover platform with obstacle mapping.',
    description: 'Custom-built mobile robotics chassis equipped with LiDAR, ultrasonic arrays, ESP32 dual-core processor, high-torque geared motors, and wireless telemetry.',
    image: '/assets/projects/wifi-car.jpg',
    specs: ['ESP32 Dual-Core 240MHz', 'Ultrasonic HC-SR04 Array', 'L298N High-Torque Motor Driver', 'Li-Ion 12V Power Bus', 'Real-time Telemetry Over WiFi'],
    features: ['Autonomous Obstacle Avoidance', 'Remote Web Controller Interface', 'Speed & Heading PID Stabilization', 'Modular Sensor Expansion Bay'],
    badge: 'Flagship Build',
    accentColor: '#f1ca62',
    iconName: 'Bot',
    highlightStat: { label: 'Obstacle Latency', value: '<18ms' },
    orderWaText: 'Hi Adam, I want to discuss the Autonomous Robotics Platform project.'
  },
  {
    id: 'talking-glove',
    name: 'Talking Gesture Glove',
    category: 'wearable',
    tag: '02 · Wearable Interface',
    tagline: 'Smart assistive glove translating sign gestures into audio speech.',
    description: 'Innovative assistive wearable utilizing resistive flex sensors on each finger combined with an MPU-6050 6-DOF IMU and an ESP32 to convert sign language hand gestures into live OLED text and spoken audio.',
    image: '/assets/projects/talking-glove.jpg',
    specs: ['5x High-Precision Flex Sensors', 'MPU-6050 6-Axis Gyro/Accelerometer', 'ESP32 Microcontroller', 'I2C OLED Display', 'Audio Speech Synthesizer Module'],
    features: ['Real-time Sign Translation', 'Low Power Battery Operation', 'Ergonomic Breathable Mesh Glove', 'Multi-gesture Calibration Memory'],
    badge: 'Assistive Tech',
    accentColor: '#38bdf8',
    iconName: 'Hand',
    highlightStat: { label: 'Gesture Accuracy', value: '98.4%' },
    orderWaText: 'Hi Adam, I want to discuss the Talking Gesture Glove project.'
  },
  {
    id: 'ai-vision',
    name: 'AI & Computer Vision Systems',
    category: 'ai',
    tag: '03 · Computer Vision',
    tagline: 'Edge AI camera inspection, worker safety & object sorting.',
    description: 'Industrial-grade camera inspection system designed for edge devices like Raspberry Pi 5 & ESP32-CAM. Features real-time neural network detection for PPE safety (helmets, vests) and automated defect sorting.',
    image: '/assets/projects/ai-vision.jpg',
    specs: ['Raspberry Pi 5 / Coral TPU Edge', 'Sony IMX708 Camera Module 3', 'OpenCV + YOLOv8 TensorRT', 'Sub-30ms Detection Latency', 'Relay / Solenoid Control Output'],
    features: ['PPE Helmet & Vest Detection', 'Conveyor Object Sorting', 'Live RTSP Video Stream with HUD', 'Instant Telegram / WhatsApp Alerts'],
    badge: 'Industrial AI',
    accentColor: '#4ade80',
    iconName: 'Eye',
    highlightStat: { label: 'Detection Speed', value: '35 FPS' },
    orderWaText: 'Hi Adam, I want to discuss an AI Vision & Inspection project.'
  },
  {
    id: 'esp32-project',
    name: 'Embedded Electronics Systems',
    category: 'electronics',
    tag: '04 · Embedded Systems',
    tagline: 'Robust IoT sensor networks, motor drivers and wireless control.',
    description: 'Custom PCB design and breadboard engineering using ESP32, STM32, and Arduino. Built for low-power remote sensors, telemetry gateways, motor controllers, and smart industrial automation.',
    image: '/assets/projects/esp32-project.jpg',
    specs: ['ESP32 / Arduino / STM32', 'I2C, SPI, UART, CAN Bus Interfaces', 'Relay & MOSFET Power Switching', 'WiFi, BLE, LoRa Wireless Links', 'LiFePO4 Power Circuitry'],
    features: ['Remote Dashboard Monitoring', 'Fail-safe Watchdog Timers', 'Industrial Noise Filtering', 'OTA Firmware Updates'],
    badge: 'Core Electronics',
    accentColor: '#fb923c',
    iconName: 'Cpu',
    highlightStat: { label: 'Uptime Reliability', value: '99.9%' },
    orderWaText: 'Hi Adam, I need help with an Embedded Electronics / ESP32 project.'
  },
  {
    id: 'robotic-hand',
    name: 'Servo Articulated Robotic Hand',
    category: 'mechatronics',
    tag: '05 · Mechatronics',
    tagline: 'Multi-joint bionic hand with individual servo finger actuation.',
    description: 'Bionic hand mechanism actuated by precision high-torque servos controlled via PCA9685 16-channel 12-bit PWM driver. Capable of delicate grasping, finger articulation, and prosthetic gesture demonstration.',
    image: '/assets/projects/robotic-hand.jpg',
    specs: ['5x MG90S Metal-Gear Micro Servos', 'PCA9685 16-Channel 12-Bit PWM Driver', '3D Printed Carbon-Reinforced Links', 'Tendon Pull Actuation System', '5V 4A Regulated Servo Rail'],
    features: ['Individual Finger Articulation', 'Variable Grasp Pressure Control', 'Gesture Preset Sequencer', 'Remote Glove Teleoperation Ready'],
    badge: 'Bionics & Mechatronics',
    accentColor: '#c084fc',
    iconName: 'Sparkles',
    highlightStat: { label: 'Degrees of Freedom', value: '5-DOF' },
    orderWaText: 'Hi Adam, I want to discuss the Servo Articulated Robotic Hand.'
  },
  {
    id: 'trash-robot',
    name: 'Trash Collecting Rover',
    category: 'robotics',
    tag: '06 · Field Robotics',
    tagline: 'Autonomous waste collection rover with solar assisted power.',
    description: 'High-torque four-wheel drive outdoor cleanup platform combining high-suction impeller collection, solar assist charging, and autonomous navigation for park and shop floor maintenance.',
    image: '/assets/projects/trash-robot.jpg',
    specs: ['All-Terrain High Grip Wheels', 'Brushless Vacuum Impeller Fan', 'Mono-crystalline Solar Assist Panel', 'High-Capacity On-board Bin', 'Ultrasonic Ground Obstacle Radar'],
    features: ['Continuous Waste Intake', 'Eco-friendly Solar Top-up', 'Rugged Impact-Resistant Chassis', 'Autonomous Sweeping Paths'],
    badge: 'CleanTech',
    accentColor: '#34d399',
    iconName: 'Trash2',
    highlightStat: { label: 'Collection Rate', value: '15L / hour' },
    orderWaText: 'Hi Adam, I want to discuss the Trash Collecting Rover.'
  },
  {
    id: 'e-adapter',
    name: 'E-Adapter Emergency Power Module',
    category: 'hardware',
    tag: '07 · Hardware Device',
    tagline: 'IPS306 solar + manual hand-crank tactical emergency power bank.',
    description: 'Rugged emergency power bank engineered with built-in solar absorption cells, folding mechanical hand-crank generator, dual USB-A and USB-C fast ports, and high-illumination LED status matrix.',
    price: '₹2,553',
    priceNum: 2553,
    image: '/assets/projects/e-adapter.jpg',
    specs: ['10,000mAh High-Density Cell', 'High-Efficiency Top Solar Cell', 'Manual High-Torque Dynamo Crank', 'USB-C In/Out + USB-A Out', 'Tactical Reinforced Enclosure'],
    features: ['Charge Anywhere Without Grid', 'Emergency Hand-Crank Power Generation', 'Battery Level 4-LED Matrix', 'Pocket-Sized & Field-Ready'],
    badge: 'Popular Hardware',
    accentColor: '#eab308',
    iconName: 'BatteryCharging',
    highlightStat: { label: 'Emergency Input', value: 'Solar + Crank' },
    orderWaText: 'Hi Adam, I want to buy the E-Adapter Power Bank for ₹2553.'
  },
  {
    id: 'tap-tag',
    name: 'DR53 Tap Tag — Touchless Smart Device',
    category: 'taptag',
    tag: '08 · Smart Touch Device',
    tagline: 'Instant touchless connection. One tap transmits your entire business.',
    description: 'Secret instant tap technology that works on all modern iPhones and Android smartphones without any mobile app required. Tap to instantly open your website, WhatsApp, catalog, Google reviews, or digital business card.',
    price: 'From ₹553',
    priceNum: 553,
    image: '/assets/projects/tap-tag.jpg',
    specs: ['Zero App Required', 'Works on iOS & Android Smartphones', 'Waterproof & Scratch-Resistant Finish', 'Dynamic Redirect URL Management', 'Lifetime Chip Durability'],
    features: ['Instant Website / Portfolio Popup', 'Direct WhatsApp Chat Trigger', 'Google Review Booster Mode', 'Digital Contact Card (vCard) Download'],
    badge: 'Tap Tag Edition',
    accentColor: '#f59e0b',
    iconName: 'Zap',
    highlightStat: { label: 'Connection Speed', value: '<0.5s Tap' },
    orderWaText: 'Hi Adam, I want to order the DR53 Tap Tag Smart Card.'
  },
  {
    id: 'custom-website',
    name: 'Custom Engineered Business Websites',
    category: 'web',
    tag: '09 · Digital Systems',
    tagline: 'Ultra-fast, cinematic dark websites with instant WhatsApp leads.',
    description: 'Tailored websites crafted for Pune businesses, industries, clothing stores, and engineering startups. Fast loading, responsive on all devices, with instant WhatsApp lead generation built right in.',
    price: 'From ₹5,300',
    priceNum: 5300,
    image: '/assets/logo.png',
    specs: ['Mobile-First Responsive Layout', 'Dark High-Tech Aesthetic', 'Integrated WhatsApp Conversion Triggers', 'SEO & Speed Optimized', 'Zero High Monthly SaaS Fees'],
    features: ['Live Interactive Product Configurator', 'Showcase Photo Galleries', 'Custom Contact & RFQ Forms', 'Domain & Hosting Deployment Assistance'],
    badge: 'Live Estimator',
    accentColor: '#f1ca62',
    iconName: 'Globe',
    highlightStat: { label: 'Setup Time', value: '48h Launch' },
    orderWaText: 'Hi Adam, I want to discuss designing a business website with DR53.'
  }
];

export const PRODUCTS: Product[] = RAW_PRODUCTS.map((p) => ({ ...p, image: asset(p.image) }));


export interface BusinessCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  recommendedFeatures: string[];
  sampleFeatures: string[];
  bannerSubtitle: string;
}

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  {
    id: 'industrial',
    name: 'Industrial & Manufacturing',
    icon: 'Factory',
    description: 'Heavy machinery, manufacturing plants, tooling, safety gear, and precision components.',
    recommendedFeatures: ['Technical Specs Table', 'Request for Quote (RFQ) Form', 'Safety Certifications Badge', 'Industrial Machinery Catalog'],
    sampleFeatures: ['Machinery Portfolio', 'PDF Spec Sheets', 'Direct Procurement WhatsApp Line'],
    bannerSubtitle: 'Engineered for factories, fabricators & industrial suppliers.'
  },
  {
    id: 'clothing',
    name: 'Clothing, Fashion & Apparel',
    icon: 'Shirt',
    description: 'Fashion brands, clothing boutiques, textile suppliers, streetwear, and designer lookbooks.',
    recommendedFeatures: ['High-Res Lookbook Showcase', 'Direct WhatsApp Order Engine', 'Size & Fabric Guide', 'Seasonal Collections Carousel'],
    sampleFeatures: ['Instagram Feed Link', 'New Drops Banner', 'WhatsApp Checkout Cart'],
    bannerSubtitle: 'Cinematic visual showcase for fashion & apparel brands.'
  },
  {
    id: 'robotics_hardware',
    name: 'Robotics, Electronics & Tech Labs',
    icon: 'Cpu',
    description: 'Hardware startups, IoT electronics, robotics studios, engineering prototyping, and labs.',
    recommendedFeatures: ['Interactive Hardware HUD', 'Schematics & Pinout Viewer', 'Milestone & Competition Timeline', 'R&D Consultation Booker'],
    sampleFeatures: ['CAD / 3D Model Viewer', 'Client Prototype Showcase', 'Direct Lab Visit Booking'],
    bannerSubtitle: 'High-tech dark aesthetics for hardware innovators.'
  },
  {
    id: 'food_cafe',
    name: 'Food, Restaurants & Cafes',
    icon: 'Utensils',
    description: 'Cafes, gourmet restaurants, cloud kitchens, bakeries, and catering services.',
    recommendedFeatures: ['Interactive Digital Menu with Prices', 'One-Click WhatsApp Table Booking', 'Delivery / Takeaway Quick Order', 'Chef Specials Banner'],
    sampleFeatures: ['Food Gallery with Zoom', 'Google Maps Location Embed', 'Customer Reviews Carousel'],
    bannerSubtitle: 'Mouthwatering presentation with zero food aggregator commissions.'
  },
  {
    id: 'medical_clinic',
    name: 'Medical, Clinics & Healthcare',
    icon: 'Stethoscope',
    description: 'Doctor clinics, dental studios, physiotherapy centers, diagnostics, and wellness centers.',
    recommendedFeatures: ['Doctor Profile & Credentials', 'Patient Appointment Form', 'Treatment & Procedure List', 'Emergency Contact Sticky Bar'],
    sampleFeatures: ['Clinic Hours & Directions', 'Patient Testimonials', 'Health Tips Blog / FAQ'],
    bannerSubtitle: 'Trustworthy, clean and informative medical presence.'
  },
  {
    id: 'real_estate',
    name: 'Real Estate & Construction',
    icon: 'Building2',
    description: 'Property developers, real estate agents, interior designers, and architects.',
    recommendedFeatures: ['Property Listing Showcase with Floorplans', 'Virtual Tour Video Embed', 'Site Visit Scheduling on WhatsApp', 'Amenities Checklist'],
    sampleFeatures: ['Location Map Pinpoints', 'Brochure PDF Download', 'Lead Qualification Form'],
    bannerSubtitle: 'High-ticket luxury presentation for real estate & builders.'
  },
  {
    id: 'retail_store',
    name: 'Retail & E-Commerce Shops',
    icon: 'ShoppingBag',
    description: 'Local retail shops, electronics stores, specialty products, and craft shops.',
    recommendedFeatures: ['Product Grid with Category Filter', 'WhatsApp Instant Cart & Order', 'Customer Reviews & Badges', 'Offers & Discount Banner'],
    sampleFeatures: ['Direct UPI / Payment QR', 'Stock Availability Indicators', 'FAQ Accordion'],
    bannerSubtitle: 'Fast e-commerce storefront with frictionless direct ordering.'
  },
  {
    id: 'services_consulting',
    name: 'Professional & Consulting Services',
    icon: 'Briefcase',
    description: 'Corporate consultants, legal advocates, accounting, marketing agencies, and coaching.',
    recommendedFeatures: ['Service Packages & Pricing Breakdown', 'Client Case Studies & Results', 'Consultation Calendar Booking', 'Team Bios & Track Record'],
    sampleFeatures: ['Client Logos Grid', 'Downloadable Whitepapers', 'WhatsApp VIP Hotline'],
    bannerSubtitle: 'Authoritative, polished presence that converts inquiries into clients.'
  }
];
