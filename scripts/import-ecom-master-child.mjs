// Import the e-com master/child EAN sheet ("final sheet.pdf") directly into
// MongoDB (ecom channel). Each row is [EAN, Product Code Name, Product Name].
//
// Rules (confirmed with the boss):
//   • The "P<n>" (or "<n> Pcs") in the code name = pack size. P1 = single.
//   • Rows sharing a base code-name (code minus the pack token) form one family.
//   • The SMALLEST pack in a family is the MASTER (its EAN = primary product);
//     that's the P1 when present, else the smallest pack (e.g. P4).
//   • Bigger packs become CHILD pack barcodes under the master (size = P-number).
//   • A row with NO pack token is a standalone single product.
//   • EANs are globally de-duplicated (first occurrence wins) — the PDF has a
//     few repeats; later duplicates are skipped and reported.
//
// Only ADDS / UPDATES products; nothing is deleted. Backs up the store first.
// Run:  node scripts/import-ecom-master-child.mjs
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const CHANNEL = "ecom";

// [EAN, Product Code Name, Product Name] — transcribed from "final sheet.pdf".
export const ROWS = [
  // ---- Page 1 ----
  ["8906199313155", "J Hook P1", "Shanya Adhesive Wall Hooks Transparent (Stainless Steel, Transparent)"],
  ["8906199310000", "J Hook P10", "Shanya Adhesive Wall Hooks Transparent (Stainless Steel, Transparent)"],
  ["8906199310017", "J Hook P15", "Shanya Adhesive Wall Hooks (Stainless Steel, Transparent)"],
  ["8906199310024", "J Hook P20", "Shanya Heavy-Duty Adhesive Wall Hooks"],
  ["8906199313162", "Big J Hook Silver P1", "Shanya Transparent Self-Adhesive Wall Hooks"],
  ["8906199311212", "Big J Hook Silver P10", "Shanya Transparent Self-Adhesive Wall Hooks"],
  ["8906199313186", "Big J Hook Golden P1", "Shanya Self Adhesive Wall Hooks"],
  ["8906199311205", "Big J Hook Golden P10", "Shanya Self Adhesive Wall Hooks"],
  ["8906199313179", "Big J Hook Black P1", "Shanya Self Adhesive Wall Hooks"],
  ["8906199311229", "Big J Hook Black P10", "Shanya Heavy Duty Adhesive Wall Hooks"],
  ["8906199313193", "Frame Hook P1", "Shanya Self Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)"],
  ["8906199310079", "Frame Hook P10", "Shanya Self Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)"],
  ["8906199310321", "Frame Hook P15", "Shanya Self Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)"],
  ["8906199310338", "Frame Hook P20", "Shanya Self Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)"],
  ["8906199311465", "Frame Hook Long P10", "Shanya Self Adhesive Wall Hooks (PVC, Transparent)"],
  ["8906199310321", "Frame Hook Long P15", "Shanya Self Adhesive Wall Hooks (PVC, Transparent)"],
  ["8906199310338", "Frame Hook Long P20", "Shanya Self Adhesive Wall Hooks (PVC, Transparent)"],
  ["8906199313209", "Nut Hook P1", "Shanya Self-Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)"],
  ["8906199310123", "Nut Hook P10", "Shanya Self-Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)"],
  ["8906199310307", "Nut Hook P15", "Shanya Self-Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)"],
  ["8906199310314", "Nut Hook P20", "Shanya Self-Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)"],
  ["8906199313223", "360 Rotating Hook P1", "Shanya Rotating Ceiling / Wall Hooks (Plastic, Black)"],
  ["8906199311717", "360 Rotating Hook P5", "Shanya Rotating Ceiling / Wall Hooks (Plastic, Black)"],
  ["8906199313230", "Star Hook P1", "Shanya Star Self-Adhesive Wall Hooks (Acrylic, Transparent)"],
  ["8906199312387", "Star Hook P5", "Shanya Star Self-Adhesive Wall Hooks (Acrylic, Transparent)"],
  ["8906199313247", "Shell Hook P1", "Shanya Shell Design Self-Adhesive Wall Hooks (Acrylic, Transparent)"],
  ["8906199312394", "Shell Hook P5", "Shanya Shell Design Self-Adhesive Wall Hooks (Acrylic, Transparent)"],
  ["8906199313254", "6PC Transparent Hook P1", "Shanya Transparent Self-Adhesive Wall Hooks"],
  ["8906199312592", "6PC Transparent Hook P2", "Shanya Transparent Self-Adhesive Wall Hooks"],
  ["8906199313285", "6PC Silver Hook P1", "Shanya Transparent Self-Adhesive Wall Hooks"],
  ["8906199312585", "6PC Silver Hook P2", "Shanya Self Adhesive Wall Hooks"],
  ["8906199313292", "6PC Green Hook P1", "Shanya Self Adhesive Wall Hooks"],
  ["8906199312578", "6PC Green Hook P2", "Shanya Self-Adhesive Wall Hooks"],
  // ---- Page 2 ----
  ["8906199313353", "Matte Black U Hook P1", "Shanya Self Adhesive Wall Hooks (Stainless Steel, Matte Black)"],
  ["8906199312899", "Matte Black U Hook P5", "Shanya Self Adhesive Wall Hooks (Stainless Steel, Matte Black)"],
  ["8906199313360", "Matte Silver U Hook P1", "Shanya Waterproof Wall Hooks (Stainless Steel, Silver)"],
  ["8906199312103", "Matte Silver U Hook P5", "Shanya Waterproof Wall Hooks (Stainless Steel, Silver)"],
  ["8906199313377", "Matte Silver Hook P1", "Shanya Premium Silver Self-Adhesive Wall Hooks"],
  ["8906199312257", "Matte Silver Hook P2", "Shanya Premium Silver Self-Adhesive Wall Hooks"],
  ["21633907", "Matte Silver Hook P4", "Shanya Premium Self-Adhesive Wall Hooks"],
  ["8906199313384", "Matte Black Hook P1", "Shanya Matte Finish Self Adhesive Wall Hooks"],
  ["8906199312240", "Matte Black Hook P2", "Shanya Matte Finish Self Adhesive Wall Hooks"],
  ["21633884", "Matte Black Hook P4", "Shanya Heavy Duty Self-Adhesive Wall Hooks"],
  ["8906199313407", "Crystal Hook P1", "Shanya Crystal Shaped Adhesive Wall Hooks"],
  ["8906199310727", "Crystal Hook P10", "Shanya Crystal Shaped Adhesive Wall Hooks"],
  ["8906199310758", "Crystal Hook P15", "Shanya Crystal Shaped Adhesive Wall Hooks"],
  ["8906199310765", "Crystal Hook P20", "Shanya Crystal Shaped Adhesive Wall Hooks"],
  ["8906199313414", "U Transparent Hook P1", "Shanya Self-Adhesive Wall Hooks Transparent"],
  ["8906199310611", "U Transparent Hook P10", "Shanya Self-Adhesive Wall Hooks Transparent"],
  ["8906199310734", "U Transparent Hook P15", "Shanya Self-Adhesive Wall Hooks Transparent"],
  ["8906199310741", "U Transparent Hook P20", "Shanya Self-Adhesive Wall Hooks Transparent"],
  ["8906199313421", "S Hook P1", "Shanya Self-Adhesive Wall Hooks"],
  ["8906199311502", "S Hook P10", "Shanya Self-Adhesive Wall Hooks"],
  ["8906199311519", "S Hook P15", "Shanya Self-Adhesive Wall Hooks"],
  ["8906199311526", "S Hook P20", "Shanya Self-Adhesive Wall Hooks"],
  ["8906199312424", "Umbrella", "Shanya Windproof Umbrella (Maroon)"],
  ["8906199312400", "Umbrella", "Shanya 3-Fold Windproof Compact Umbrella (Blue)"],
  ["8906199312417", "Umbrella", "Shanya 3 Fold Windproof Compact Umbrella (Green)"],
  ["8906199310116", "Umbrella", "Shanya Classic 2-Fold Manual Button Umbrella (Black)"],
  ["8906199310109", "Umbrella", "Shanya 3-Fold Windproof Compact Umbrella (Black)"],
  ["8906199313001", "Rain Coat", "Shanya Rain Suit (Black)"],
  ["8906199313018", "Rain Coat", "Shanya Rain Suit (Blue)"],
  ["8906199313438", "Cloth Rope P1", "Shanya Nylon Cloth Rope with Clips (Multicolour)"],
  ["8906199310093", "Cloth Rope P2", "Shanya Nylon Cloth Rope with Clips (Multicolour)"],
  ["8906199310208", "3-in-1 Soap Dispenser P1", "Shanya Soap Dispenser with Hand Wash & Scrub Holder (Plastic)"],
  ["8906199311694", "Bathroom Shelf Black & White P1", "Shanya Adhesive Bathroom Shelf (Plastic, White)"],
  // ---- Page 3 ----
  ["8906199311670", "Bathroom Shelf Black & White P2", "Shanya Wall Mounted Bathroom Shelf (Plastic, white)"],
  ["8906199313445", "Bathroom Shelf White P1", "Shanya Self Adhesive Bathroom Shelf (Plastic, White)"],
  ["8906199311663", "Bathroom Shelf White P2", "Shanya Self Adhesive Bathroom Shelf (Plastic, White)"],
  ["8906199311779", "Bathroom Towel Rod Single P1", "Shanya No Drill Towel Rack (Stainless Steel, White)"],
  ["8906199311762", "Bathroom Towel Rod Double P1", "Shanya Double Towel Rack (Stainless Steel, White)"],
  ["8906199310215", "Bathroom Floor Wiper P1", "Shanya Multi-Functional Floor Wiper"],
  ["8906199311724", "Adhesive Handle P6", "Shanya Self Adhesive Handle (Plastic, Multicolour)"],
  ["8906199310604", "Knife Set - Black P1", "Shanya Knife Set (Stainless Steel)"],
  ["8906199310659", "Knife Set - Purple P1", "Shanya Printed Kitchen Knife Set (Stainless Steel)"],
  ["8906199310628", "Knife Set - Blue P1", "Shanya Premium Printed Blue Knife Set (Stainless Steel)"],
  ["8906199310642", "Knife Set - Green P1", "Shanya Green Knife Set with Covers (Stainless Steel)"],
  ["8906199310635", "Knife Set - Red P1", "Shanya Premium Red Kitchen Knife Set (Stainless Steel)"],
  ["8906199311731", "Microfiber Duster Ball P2", "Shanya Soft Duster Ball (Microfiber, Grey & White)"],
  ["8906199311489", "", "Shanya Glass Spray Oil Dispenser Bottle"],
  ["8906199313452", "Plastic Oil Dispenser P1", "Shanya Plastic Oil Dispenser"],
  ["8906199311755", "Plastic Oil Dispenser P2", "Shanya Plastic Oil Dispenser"],
  ["8906199311977", "Teddy Toothbrush Holder Set P1", "Shanya Bear Toothbrush Holder (Plastic, Multicolour)"],
  ["8906199312233", "Soap & Toothbrush Holder Set", "Shanya Soap & Toothbrush Holder Set (Plastic, White)"],
  ["8906199312226", "Penguin Toothbrush Holder P1", "Shanya Penguin Toothbrush Holder (Plastic, Multicolour)"],
  ["8906199311748", "Soap Case with Lid P1", "Shanya Modern Soap Case with Lid (Plastic, Multicolor)"],
  ["8906199311687", "Kitchen Brush P1", "Shanya Multipurpose Kitchen Brush (Plastic, Purple)"],
  ["8906199313476", "Silicone Baking Mat P1", "Shanya Anti-Skid Baking Mat (Silicone)"],
  ["8906199310130", "Silicone Baking Mat P2", "Shanya Anti-Skid Baking Mat (Silicone)"],
  ["8906199310192", "Shoe Cleaning Wipes P1", "Shanya Shoe Cleaning Wipes"],
  ["8906199310178", "Shoe Cleaning Wipes P2", "Shanya Shoe Cleaning Wipes"],
  ["8906199311557", "Leather Cleaning Wipes P1", "Shanya Leather Cleaning Wipes (Cotton)"],
  ["8906199311540", "Leather Cleaning Wipes P2", "Shanya Leather Cleaning Wipes (Cotton)"],
  ["8906199313490", "Ice Cube Tray Hexagonal - P1", "Shanya Ice Tray (Silicone)"],
  ["8906199310031", "Ice Cube Tray Hexagonal - P2", "Shanya Ice Tray (Silicone)"],
  ["8906199313506", "Ice Cube Tray Circle - P1", "Shanya Ice Tray Set (Silicone)"],
  ["8906199310055", "Ice Cube Tray Circle - P2", "Shanya Ice Tray Set (Silicone)"],
  ["8906199312998", "Spoon Set P1", "Shanya Stainless Steel Blue Handle Spoon Set"],
  ["8906199312981", "Fork Set 1", "Shanya Stainless Steel Marble Style Fork Set"],
  ["8906199312097", "Airtight Container", "Shanya Plastic Airtight Container"],
  // ---- Page 4 ----
  ["8906199311939", "Airtight Container", "Shanya Plastic 4-Section Airtight Storage Container"],
  ["8906199313117", "Air Fryer Mat", "Air Fryer Mat Silicone"],
  ["8906199312936", "Evil Eye Key Chain - Tree P1", "Shanya Metallic Evil Eye Charm Key Chain"],
  ["8906199312929", "Evil Eye Key Chain - Elephant P1", "Shanya Elephant Evil Eye Key Chain"],
  ["8906199312943", "Evil Eye Key Chain - Dream Catcher P1", "Shanya Dream Catcher Evil Eye Key Chain"],
  ["8906199312950", "Evil Eye Key Chain - Peacock P1", "Shanya Peacock Key Chain"],
  ["8906199312967", "Evil Eye Key Chain - Turtle P1", "Shanya Turtle Evil Eye Key Chain"],
  ["8906199312974", "Evil Eye Key Chain - Owl P1", "Shanya Evil Eye Owl Key Chain"],
  ["8906199311472", "Gaurdian Bell - Golden P1", "Shanya Key Chain (Golden)"],
  ["8906199312875", "Gaurdian Bell - Bronze P1", "Shanya Engraved Bronze Bell Key Chain with Evil Eye"],
  ["8906199312868", "Gaurdian Bell - Silver P1", "Shanya Silver Metal Bell Key Chain with Evil Eye Charm"],
  ["8906199311700", "Face Changing Key Chain P1", "Shanya Shinchan Face Changing Cartoon Key Chain"],
  ["8906199313520", "Name Tag Key Chain P1", "Shanya Plastic Key Chain with Label Window"],
  ["8906199312691", "Name Tag Key Chain - 30 Pcs", "Shanya Plastic Key Chain with Label Window"],
  ["8906199312684", "Name Tag Key Chain - 50 Pcs", "Shanya Plastic Key Chain with Label Window"],
  ["8906199313537", "Gold Crown A P1", "Rose Gold Birthday Girl Crown & Sash by Shanya"],
  ["8906199313544", "Gold Sash P1", "Rose Gold Birthday Girl Crown & Sash by Shanya"],
  ["8906199313087", "Rose Gold Crown & Sash P1", "Rose Gold Birthday Girl Crown & Sash by Shanya"],
  ["8906199313551", "Gold Crown B P1", "Birthday Girl Sash & Crown by Shanya"],
  ["8906199311823", "Golden Crown & Sash P1", "Birthday Girl Sash & Crown by Shanya"],
  ["8906199313568", "Gold Crown C P1", "Glitter Tiara with Satin Sash by Shanya"],
  ["8906199313070", "Golden Bday Girl Band & Sash P1", "Glitter Tiara with Satin Sash by Shanya"],
  ["8906199313575", "Silver Bday Girl Band P1", "Birthday Girl Sash & Headband Set by Shanya"],
  ["8906199313582", "Silver & Pink Sash P1", "Birthday Girl Sash & Headband Set by Shanya"],
  ["8906199310949", "Silver Bday Girl Band & Sash P1", "Birthday Girl Sash & Headband Set by Shanya"],
  ["8906199313599", "Silver Crown P1", "Birthday Girl Glitter Sash & Tiara Crown by Shanya"],
  ["8906199313605", "Sash P1", "Birthday Girl Glitter Sash & Tiara Crown by Shanya"],
  ["8906199313063", "Silver Crown & Sash P1", "Birthday Girl Glitter Sash & Tiara Crown by Shanya"],
  ["8906199312882", "Butterfly Crown P1", "Princess Dress Up Tiara Shanya"],
  ["8906199311854", "Welcome Baby Boy - Foot P1", "Welcome Baby Boy Decoration Kit by Shanya"],
  ["8906199311830", "Welcome Baby Girl - Foot P1", "Welcome Baby Girl Decoration Kit by Shanya"],
  ["8906199310987", "Welcome Baby Boy - Baby P1", "Welcome Baby Boy Foil Balloons Decoration Kit by Shanya"],
  ["21633861", "Welcome Baby Girl - Baby P1", "Welcome Baby Girl Decoration Kit by Shanya"],
  // ---- Page 5 ----
  ["8906199310970", "Welcome Baby Girl - Baby P1", "Welcome Baby Girl Foil Balloon Decoration Kit by Shanya"],
  ["8906199310826", "HBD Foil Balloon Polka Dots P1", "Happy Birthday Foil Balloons (Polka Hearts) by Shanya"],
  ["8906199311083", "HBD Banner - Pink Cursive P1", "Pink Glitter Cursive Happy Birthday Banner by Shanya"],
  ["8906199311076", "HBD Banner - Silver Cursive P1", "Silver Glitter Cursive Happy Birthday Banner by Shanya"],
  ["8906199311069", "HBD Banner - Blue Cursive P1", "Blue Glitter Cursive Happy Birthday Banner by Shanya"],
  ["8906199311052", "HBD Banner - Rose Gold Cursive", "Rose Gold Glitter Cursive Happy Birthday Banner by Shanya"],
  ["8906199311038", "HBD Banner - Gold Cursive", "Golden Shinning Happy Birthday Banner by Shanya"],
  ["8906199311014", "HBD Banner - White Box", "Happy Birthday Banner Shanya"],
  ["8906199311007", "HBD Banner - Black Box", "Happy Birthday Banner (Black & Gold) by Shanya"],
  ["8906199311021", "HBD Banner - Pink Box", "Happy Birthday Banner - Shanya"],
  ["8906199310994", "HBD Banner - Golden Box", "Happy Birthday Banner by Shanya"],
  ["8906199310932", "Butterfly Happy Birthday Banner by Shanya", "Butterfly Happy Birthday Banner by Shanya"],
  ["8906199310925", "Mermaid Theme Happy Birthday Banner by Shanya", "Mermaid Theme Happy Birthday Banner by Shanya"],
  ["8906199310918", "Unicorn Theme Happy Birthday Banner by Shanya", "Unicorn Theme Happy Birthday Banner by Shanya"],
  ["8906199312462", "Big TV P4", "Shanya Hair Clip - Pack of 8 (Multicolour)"],
  ["8906199312455", "Small TV P4", "Shanya Hair Clip - Pack of 8 (Multicolour)"],
  ["8906199310284", "Tv + Square P8 Neutral", "Shanya Hair Clip - Pack of 8 (Multicolour)"],
  ["8906199310277", "Wave P4 Neutral", "Shanya Wave Design Hair Claw Clip (Multicolour)"],
  ["8906199310291", "Infinity P4 Neutral", "Shanya Matte Finish Hair Claw Clip (Multicolour)"],
  ["8906199310253", "Bow Tie P4 Neutral", "Shanya Bow Tie Design Claw Clip (Multicolour)"],
  ["8906199310239", "6 Flower P4 Neutral", "Shanya Matte Finish Premium Claw Clip (Multicolour)"],
  ["8906199310246", "Flower Leaf P4 Neutral", "Shanya Flower Leaf Claw Clip (Multicolour)"],
  ["8906199310260", "Flower P4 Neutral", "Shanya Flower Claw Clip (Multicolour)"],
  ["8906199312615", "Mini Square P4 Neutral", "Shanya Claw Clip (Beige, Brown, Taupe, Black)"],
  ["8906199312462", "TV P4 Neutral", "Shanya Large Matte Hair Claw Clip (Olive Green, Espresso Brown, Ivory Beige, and Matte Black)"],
  ["8906199312455", "Small TV P4", "Shanya Claw Clip Set (Ivory, Taupe Beige, Mocha Brown, Matte Black)"],
  ["8906199312905", "Infinity P4 Neutral - Flexible", "Shanya Flexible Hair Claw Clip (Cream, Beige, Brown, Black)"],
  ["8906199310345", "Hui Hui P6", "Shanya Premium Matte Mini Claw Clip (Colour May Vary)"],
  ["8906199310352", "Hui Hui P12", "Shanya Mini Claw Clip Set (Colour May Vary)"],
  ["8906199310819", "Mini Flower P6 Multicolour", "Shanya Mini Flower Hair Claw Clip Set (Colour May Vary)"],
  ["8906199310567", "Big Flower P6 Multicolour", "Shanya Floral Claw Clip (Colour May Vary)"],
  ["8906199311946", "Matte Daisy P6 Multicolour", "Shanya Matte Daisy Hair Claw Clip (Multicolour)"],
  ["8906199311953", "Matte Daisy Design 2 P6 Multicolour", "Shanya Daisy Style Claw Clip (Multicolour)"],
  ["8906199312134", "Small Butterfly P6 Multicolour", "Shanya Small Butterfly Claw Clip (Multicolour)"],
  // ---- Page 6 ----
  ["8906199310581", "Matte D P3 Neutral/Multicolour", "Shanya Matte Finish Arch Claw Clip (Multicolour)"],
  ["8906199310703", "Matte D P3 Neutral/Multicolour", "Shanya Claw Clip (Multicolour)"],
  ["8906199312141", "Metal Single Flower P6 Multicolour", "Shanya Embellished Metal Claw Clip (Multicolour)"],
  ["8906199310796", "Metal Double Flower P6 Multicolour", "Shanya Flower Design with Rhinestones Claw Clip (Assorted)"],
  ["8906199312110", "Double Cherry Marble P6", "Shanya Pastel Marble Mini Claw Clip Set (Multicolour)"],
  ["8906199312004", "Square Marble P6", "Shanya Marble Texture Claw Clip Set (Colour May Vary)"],
  ["8906199310697", "Hair Brooch P1", "Shanya Floral Claw Clip (Multicolour)"],
  ["8906199311960", "Petal Tic Tac P10 Multicolour", "Shanya Soft Matte Hair Clip Set (Multicolour)"],
  ["8906199312127", "Banana Clip P4 Neutral", "Shanya Matte Banana Hair Clip (Coffee, Beige, Taupe, Black)"],
  ["8906199311410", "Shanya Pearl & Crystal Floral Hair Pin (Pink & White)", "Shanya Pearl & Crystal Floral Hair Pin (Pink & White)"],
  ["8906199311434", "Shanya Pearl & Crystal Leaf Hair Pin (White)", "Shanya Pearl & Crystal Leaf Hair Pin (White)"],
  ["8906199311427", "Shanya Pearl & Crystal Floral Hair Pin (White & Red)", "Shanya Pearl & Crystal Floral Hair Pin (White & Red)"],
  ["8906199312073", "Rubber Band Multicolour P100", "Shanya Elastic Hair Ties (Pastel)"],
  ["8906199311984", "Rubber Band Set of 7 P1", "Shanya Flower & Bow Cute Hair Ties Set (Brown)"],
  ["8906199311847", "Rubber Band Neutral P50", "Shanya Soft Elastic Hair Ties (Multicolor)"],
  ["8906199313612", "Gajra Scrunchie White P1", "Shanya Jasmin Artificial Gajra (White)"],
  ["8906199310369", "Gajra Scrunchie White P2", "Shanya Jasmin Artificial Gajra (White)"],
  ["8906199313636", "Gajra Scrunchie 3 Rose P1", "Shanya Scented Artificial Gajra Set (White & Red)"],
  ["8906199313643", "Gajra Scrunchie Designer P1", "Shanya Scented Artificial Gajra Set (White & Red)"],
  ["8906199310390", "Gajra Scrunchie all Design P3", "Shanya Scented Artificial Gajra Set (White & Red)"],
  ["8906199311090", "Hair Bun Scrunchie - Brown P1", "Shanya Hair Bun Scrunchie (Brown)"],
  ["8906199310901", "Hair Bun Scrunchie - Black P1", "Shanya Hair Bun Scrunchie (Black)"],
  ["8906199311373", "Long Straight Pony Tail - Brown P1", "Shanya Straight Ponytail Hair Extensions (Brown)"],
  ["8906199311380", "Long Straight Pony Tail - Black P1", "Shanya Long Straight Ponytail Hair Extensions (Black)"],
  ["8906199311403", "Frill Length - Brown P1", "Shanya Curly Frill Bun Hair Extensions (Brown)"],
  ["8906199311397", "Frill Length - Black P1", "Shanya Curly Frill Bun Hair Extensions (Black)"],
  ["8906199311120", "5 Clip Long Straight - Brown P1", "Shanya Clip-In Straight Hair Extensions (Natural Dark Brown)"],
  ["8906199311137", "5 Clip Long Straight - Black P1", "Shanya 5 Clip-In Straight Hair Extensions (Natural Black)"],
  ["8906199311106", "5 Clip Long Curly - Brown P1", "Shanya Clip-In Curly Hair Extensions (Natural Dark Brown)"],
  ["8906199311113", "5 Clip Long Curly - Black P1", "Shanya Clip-In Curly Hair Extensions (Natural Black)"],
  ["8906199311236", "1 Clip Long Straight - Rose Gold", "Shanya Clip-In Streaks Hair Extensions (Rose Gold)"],
  ["8906199311243", "1 Clip Long Straight - Pink", "Shanya Synthetic Clip-In Hair Extensions (Rose Pink)"],
  ["8906199311250", "1 Clip Long Straight - Purple", "Shanya Clip-In Hair Extensions (Purple)"],
  // ---- Page 7 ----
  ["8906199311274", "1 Clip Long Straight - Baby Pink", "Shanya Clip In Hair Extensions (Baby Pink)"],
  ["8906199311281", "1 Clip Long Straight - Gold", "Shanya Hair Extensions (Gold)"],
  ["8906199313025", "Shanya Bracelets & Earrings Set (Golden, Silver) P1", "Shanya Bracelets & Earrings Set (Golden, Silver)"],
  ["8906199313049", "Shanya Heart Drop Pendant with Chain (Golden) P1", "Shanya Heart Drop Pendant with Chain (Golden)"],
  ["8906199313032", "Shanya Elegant Heart Pendant with Chain (Golden) P1", "Shanya Elegant Heart Pendant with Chain (Golden)"],
  ["8906199313056", "Shanya Heart Charm Contemporary Necklace (Golden) P1", "Shanya Heart Charm Contemporary Necklace (Golden)"],
  ["8906199312561", "Pet Ball P1", "Shanya Smart Rolling Ball Pet Toy with Rope (Red)"],
  ["8906199312295", "Lord Ganesha Evil Eye Wall Hanging (Blue) - Shanya P1", "Lord Ganesha Evil Eye Wall Hanging (Blue) - Shanya"],
  ["8906199312288", "Bright Owl Evil-Eye Wall Hanging (Blue) - Shanya P1", "Bright Owl Evil-Eye Wall Hanging (Blue) - Shanya"],
  ["8906199312271", "Elegant Owl & Evil-Eye Wall Hanging (Blue) - Shanya P1", "Elegant Owl & Evil-Eye Wall Hanging (Blue) - Shanya"],
  ["8906199312264", "Wooden Elephant Hamza Evil-Eye Wall Hanging (Green & Blue) - Shanya P1", "Wooden Elephant Hamza Evil-Eye Wall Hanging (Green & Blue) - Shanya"],
  ["8906199312189", "Shanya Royal Mosaic Foil Work Shagun Envelope P1", "Shanya Royal Mosaic Foil Work Shagun Envelope"],
  ["8906199312172", "Shanya Royal Elephant with Foil Money Envelope P1", "Shanya Royal Elephant with Foil Money Envelope"],
  ["8906199312028", "Shanya Elephant Tree Foil Shagun Envelope P1", "Shanya Elephant Tree Foil Shagun Envelope"],
  ["8906199311991", "Shanya Premium Elephant Print Envelope P1", "Shanya Premium Elephant Print Envelope"],
  ["8906199312011", "Shanya Premium Peacock Print Envelope P1", "Shanya Premium Peacock Print Envelope"],
  ["8906199310185", "Shanya Analog Wall Clock (White) P1", "Shanya Analog Wall Clock (White)"],
];

/** Pull a pack size out of a code name. Returns {size, base} or null when the
 *  code has no pack token (→ standalone single product). */
export function extractPack(code) {
  const c = String(code || "").trim();
  if (!c) return null;
  // "<n> Pcs" (needs the trailing "s" so "6PC" is NOT mistaken for 6 Pcs).
  let m = c.match(/(\d+)\s*Pcs\b/i);
  if (m) return { size: Number(m[1]), base: c.replace(m[0], " ") };
  // "P<n>" as its own token (word boundary before P — so "6PC" is skipped).
  m = c.match(/\bP(\d+)\b/);
  if (m) return { size: Number(m[1]), base: c.replace(m[0], " ") };
  return null;
}

/** Normalise a base code-name into a grouping key. */
export function baseKey(base) {
  return String(base)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[-/]+\s*$/, "")
    .replace(/^\s*[-/]+/, "")
    .trim()
    .toLowerCase();
}

function envVal(text, key) {
  const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "mi"));
  return m ? m[1].trim() : undefined;
}

async function main() {
  const env = await readFile(".env.local", "utf8");
  const uri = envVal(env, "MONGODB_URI");
  const dbName = envVal(env, "MONGODB_DB") || "inventory";
  if (!uri) throw new Error("MONGODB_URI not found in .env.local");

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const col = client.db(dbName).collection("app");
  const doc = await col.findOne({ _id: "store" });
  if (!doc) throw new Error("store doc not found");
  const store = doc.data;

  await writeFile("import-backup-ecom-master-child.json", JSON.stringify(store));

  // ---- Classify rows into families + standalones -----------------------------
  const families = new Map(); // baseKey -> [{ean, code, name, size}]
  const standalones = []; // {ean, code, name}
  for (const [ean, code, name] of ROWS) {
    const pack = extractPack(code);
    if (!pack) {
      standalones.push({ ean: String(ean), code, name });
    } else {
      const key = baseKey(pack.base) || String(ean);
      if (!families.has(key)) families.set(key, []);
      families.get(key).push({ ean: String(ean), code, name, size: pack.size });
    }
  }

  // ---- Existing e-com catalog (for upsert + global EAN de-dup) ----------------
  const ecom = store.products.filter((p) => p.channel === CHANNEL);
  const byEan = new Map(); // primary EAN -> product
  const usedEan = new Set(); // every EAN in use (primary + pack barcodes)
  for (const p of ecom) {
    byEan.set(p.ean, p);
    usedEan.add(p.ean);
    if (!Array.isArray(p.barcodes)) p.barcodes = [];
    for (const b of p.barcodes) usedEan.add(b.ean);
  }

  // Total stock (pieces) per EAN, to guard consolidation.
  const stockByEan = new Map();
  for (const s of store.stock) {
    stockByEan.set(s.ean, (stockByEan.get(s.ean) || 0) + (s.quantity || 0));
  }
  /** Delete a standalone product + its (zero) stock rows so it can be re-homed
   *  as a pack barcode under its master. */
  function removeStandalone(ean) {
    store.products = store.products.filter((p) => !(p.channel === CHANNEL && p.ean === ean));
    store.stock = store.stock.filter((s) => s.ean !== ean);
    byEan.delete(ean);
    usedEan.delete(ean);
  }

  const report = {
    mastersCreated: 0,
    mastersUpdated: 0,
    standaloneCreated: 0,
    standaloneUpdated: 0,
    childrenAdded: 0,
    childrenRehomed: 0, // was its own product, now a pack barcode under master
    skippedDupEan: [], // child EANs already in use elsewhere
    skippedHasStock: [], // child product carried stock → left untouched
    extraSameSize: [], // duplicate members with the master's size → own product
  };

  function ensureProduct(ean, name) {
    let p = byEan.get(ean);
    if (p) {
      if (name && name.trim()) p.name = name.trim();
      return { product: p, created: false };
    }
    p = {
      ean,
      channel: CHANNEL,
      name: (name || `Product ${ean}`).trim(),
      comboSizes: [],
      barcodes: [],
      reorderLevel: 0,
    };
    store.products.push(p);
    byEan.set(ean, p);
    usedEan.add(ean);
    return { product: p, created: true };
  }

  // ---- Pass 1: masters (smallest pack per family) ----------------------------
  const masterOf = new Map(); // baseKey -> master product
  for (const [key, members] of families) {
    members.sort((a, b) => a.size - b.size);
    const master = members[0];
    const { product, created } = ensureProduct(master.ean, master.name);
    masterOf.set(key, product);
    if (created) report.mastersCreated++;
    else report.mastersUpdated++;
  }

  // ---- Pass 1b: standalone single products -----------------------------------
  for (const s of standalones) {
    if (usedEan.has(s.ean) && !byEan.has(s.ean)) {
      // EAN already used as someone else's pack barcode — skip to stay unique.
      report.skippedDupEan.push(`${s.ean} (${s.code || s.name}) [standalone]`);
      continue;
    }
    const { created } = ensureProduct(s.ean, s.name);
    if (created) report.standaloneCreated++;
    else report.standaloneUpdated++;
  }

  // ---- Pass 2: children (bigger packs) attach to their master ----------------
  const masterEans = new Set([...masterOf.values()].map((p) => p.ean));
  for (const [key, members] of families) {
    const master = masterOf.get(key);
    const masterSize = members[0].size;
    for (let i = 1; i < members.length; i++) {
      const child = members[i];
      // A second member at the master's own size isn't a "pack" — keep it as a
      // standalone product so it isn't lost.
      if (child.size === masterSize) {
        if (usedEan.has(child.ean)) {
          report.skippedDupEan.push(`${child.ean} (${child.code}) [dup-of-master-size]`);
          continue;
        }
        ensureProduct(child.ean, child.name);
        report.extraSameSize.push(`${child.ean} (${child.code})`);
        continue;
      }
      // Already a pack barcode on this master → nothing to do.
      if (master.barcodes.some((b) => b.ean === child.ean)) continue;

      // If the child EAN currently exists as its OWN e-com product, re-home it:
      // move it under the master as a pack barcode (only when it carries no
      // stock — otherwise leave it alone and report).
      if (byEan.has(child.ean) && !masterEans.has(child.ean)) {
        const qty = stockByEan.get(child.ean) || 0;
        if (qty > 0) {
          report.skippedHasStock.push(`${child.ean} (${child.code}) qty=${qty}`);
          continue;
        }
        removeStandalone(child.ean);
        master.barcodes.push({ ean: child.ean, size: child.size, name: child.code });
        usedEan.add(child.ean);
        report.childrenRehomed++;
        continue;
      }
      // EAN used elsewhere (another product's barcode, or a master) → skip.
      if (usedEan.has(child.ean)) {
        report.skippedDupEan.push(`${child.ean} (${child.code})`);
        continue;
      }
      master.barcodes.push({ ean: child.ean, size: child.size, name: child.code });
      usedEan.add(child.ean);
      report.childrenAdded++;
    }
  }

  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });

  console.log("✓ E-com master/child import done.");
  console.log(`  rows in sheet:        ${ROWS.length}`);
  console.log(`  families:             ${families.size}`);
  console.log(`  masters created:      ${report.mastersCreated}`);
  console.log(`  masters updated:      ${report.mastersUpdated}`);
  console.log(`  standalone created:   ${report.standaloneCreated}`);
  console.log(`  standalone updated:   ${report.standaloneUpdated}`);
  console.log(`  child packs added (new):     ${report.childrenAdded}`);
  console.log(`  child packs re-homed:        ${report.childrenRehomed}  (was own product → now barcode under master)`);
  console.log(`  extra same-size → own product: ${report.extraSameSize.length}`);
  for (const x of report.extraSameSize) console.log(`      • ${x}`);
  console.log(`  skipped (had stock, untouched): ${report.skippedHasStock.length}`);
  for (const x of report.skippedHasStock) console.log(`      • ${x}`);
  console.log(`  skipped (duplicate EAN): ${report.skippedDupEan.length}`);
  for (const x of report.skippedDupEan) console.log(`      • ${x}`);
  console.log(`  total e-com products now: ${store.products.filter((p) => p.channel === CHANNEL).length}`);
  await client.close();
}

// Only run when invoked directly (so other scripts can import ROWS/helpers).
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("✗", e.message);
    process.exit(1);
  });
}
