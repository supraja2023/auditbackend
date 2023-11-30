const express =  require('express');
const app = express()
const cors=require('cors')
const bodyParser=require('body-parser')
app.use(cors())
app.use(express.json())//middleware
const path = require('path'); 
const multer=require('multer');
const DB_URI="mongodb://localhost:27017/fileDB"
const mongoose=require('mongoose')
// const {Expense}=require('./model');
const PORT = process.env.PORT || 8000;

mongoose.connect(DB_URI)
// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now(); // Get the current timestamp
    const originalName = path.parse(file.originalname).name; // Extract the original filename without extension
    const newFilename = `${originalName}-${timestamp}${path.extname(file.originalname)}`;
    cb(null, newFilename);
  },
});

const upload = multer({ storage: storage });

// Define schema for files
const fileSchema = new mongoose.Schema({
  filePath: String,
});

const File = mongoose.model('File', fileSchema);



    
  const expenseSchema = new mongoose.Schema({
    
      eid: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true 
    },
    amount: {
      type: Number,
      required: true,
    },
     date: {
      type: Date,
      required: true,
    },
    receipt: {
     type: String
    },
    status:
    {
      type: String,
      default: 'unsaved'
    },
    reason:
    {
      type: String,
      default: ''
    },
    approvedDate:
    {
      type: Date,
      default: Date.now,
    },
    approvedBy:
    {
      type: String,
      default: ''
    }
    
 
  
  });
  
  
  const Expense = mongoose.model('Expense', expenseSchema);
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  app.post('/upload-expenses', upload.array('receipts', 100), async (req, res) => {
    try {
      const expenseData = JSON.parse(req.body.expenses);
      const action = req.body.action; // New field to determine the action
  
      // Save each resume file to MongoDB and get the URLs
      const receiptPaths = req.files.map(file => `uploads/${file.filename}`);
  
      // Save student details to MongoDB
      const expenses = expenseData.map((expense, index) => ({
        eid: expense.eid,
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        date: expense.date,
        receipt: receiptPaths[index],
      }));
  
      const savedExpenses = await Expense.insertMany(expenses);
  
      if (action === 'save') {
        // Update the status of expenses to 'saved'
        await Expense.updateMany({ _id: { $in: savedExpenses.map(expense => expense._id) } }, { $set: { status: 'saved' } });
      } else if (action === 'submit') {
        // Update the status of expenses to 'submitted for approval'
        await Expense.updateMany({ _id: { $in: savedExpenses.map(expense => expense._id) } }, { $set: { status: 'submitted for approval' } });
      }
  
      res.status(201).json({ message: 'Expenses uploaded successfully', students: savedExpenses });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  app.get('/fetch-saved-expenses', async (req, res) => {
    try {
      const savedExpenses = await Expense.find({ status: 'saved' });
      res.status(200).json(savedExpenses);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
app.get('/getSubmittedExpenses', async (req, res) => {
  try {
    const submittedExpenses = await Expense.find({ status: 'submitted for approval' });
    res.status(200).json(submittedExpenses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.put('/updateStatus', async (req, res) => {
  try {
    const { expenseUpdates } = req.body;

    // Iterate through each expense update
    for (const update of expenseUpdates) {
      const { expenseId, action, reason } = update;

      // Validate that the action is either 'approve' or 'reject'
      if (action !== 'approve' && action !== 'reject') {
        return res.status(400).json({ error: 'Invalid action' });
      }

      // Determine the status based on the action
      const status = action === 'approve' ? 'approved' : 'rejected';

      // Create an object to update
      const updateObj = { $set: { status } };

      // If action is 'reject', add the reason to the update object
      if (action === 'reject') {
        updateObj.$set.reason = reason;
      }
      if (action === 'approve') {
        updateObj.$set.approvedDate = new Date().toISOString().slice(0, 10);
      }

      // Update the status of the individual expense
      await Expense.updateOne({ _id: expenseId }, updateObj);
    }

    res.status(200).json({ message: 'Expenses updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/searchExpenses', async (req, res) => {
  try {
    const { searchQuery } = req.query;

    const approvedRecords = await Expense.find({
      status: 'approved',
      $or: [
        { category: { $regex: new RegExp(searchQuery, 'i') } }, // Case-insensitive search for category
        { description: { $regex: new RegExp(searchQuery, 'i') } }, // Case-insensitive search for description
      ],
    });

    res.status(200).json(approvedRecords);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/getApprovedRecordsByMonth', async (req, res) => {
  try {
    const moment=require('moment')
    const { selectedMonth } = req.query;

    const approvedRecords = await Expense.find({
      status: 'approved',
      date: {
        $gte: new Date(moment(selectedMonth).startOf('month')),
        $lte: new Date(moment(selectedMonth).endOf('month')),
      },
    });

    res.status(200).json(approvedRecords);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/currentMonthCosts', async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; 
    const totalCosts = await Expense.aggregate([
      {
        $match: {
          status: 'approved',
          $expr: {
            $eq: [{ $month: '$date' }, currentMonth],
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    if (totalCosts.length > 0) {
      res.status(200).json({ totalCosts: totalCosts[0].total });
    } else {
      res.status(200).json({ totalCosts: 0 });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



app.get('/lastMonthCosts', async (req, res) => {
  try {
    const currentDate = new Date();
   const currentMonth = currentDate.getMonth() + 1; 
   const currentYear = currentDate.getFullYear();
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const lastYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    const totalCosts = await Expense.aggregate([
      {
        $match: {
          status: 'approved',
          $expr: {
            $and: [
              { $eq: [{ $year: '$date' }, lastYear] },
              { $eq: [{ $month: '$date' }, lastMonth] },s
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    if (totalCosts.length > 0) {
      res.status(200).json({ totalCosts: totalCosts[0].total });
    } else {
      res.status(200).json({ totalCosts: 0 });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/getExpenseDataMonthwise', async (req, res) => {
  try {
    const moment = require('moment');
    const currentMonth = moment().month() + 1;
    const currentYear = moment().year();
    const expenseData = await Expense.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(`${currentYear}-${currentMonth}-01`),
            $lt: new Date(moment(`${currentYear}-${currentMonth}-01`).endOf('month')),
          },
          status: 'approved',
        },
      },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    res.status(200).json(expenseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/getExpenseStatusCount', async (req, res) => {
  try {
    const moment = require('moment');
    const currentMonth = moment().month() + 1;
    const currentYear = moment().year();

    const expenseStatusCount = await Expense.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(`${currentYear}-${currentMonth}-01`),
            $lt: new Date(moment(`${currentYear}-${currentMonth}-01`).endOf('month')),
          },
          status: { $in: ['approved', 'rejected', 'submitted for approval'] },
        },
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ['$status', 'submitted for approval'] },
              then: 'pending', // Display as 'pending'
              else: '$status', // Keep other statuses unchanged
            },
          },
          count: { $sum: 1 },
        },
      },
      {
        $addFields: {
          color: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 'approved'] }, then: 'green' },
                { case: { $eq: ['$_id', 'rejected'] }, then: 'red' },
                { case: { $eq: ['$_id', 'pending'] }, then: 'orange' },
              ],
              default: 'gray',
            },
          },
        },
      },
    ]);

    res.status(200).json(expenseStatusCount);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/getApprovedExpensesLast3Months', async (req, res) => {
  try {
    const moment = require('moment');

    const currentMonth = moment().month() + 1;
    const currentYear = moment().year();

    const approvedExpensesLast3Months = await Expense.aggregate([
      {
        $match: {
          date: {
            $gte: moment().subtract(3, 'months').startOf('month').toDate(),
            $lte: moment().endOf('month').toDate(),
          },
          status: 'approved',
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%b-%Y',
              date: '$date',
            },
          },
          totalAmount: { $sum: '$amount' },
        },
      },
      {
        $sort: {
          '_id': -1, // Sort in ascending order
        },
      },
    ]);

    res.status(200).json(approvedExpensesLast3Months);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/getListOfMonths', (req, res) => {
  const moment=require('moment')
  const generateMonthsList = () => {
    const monthsList = [];
    const startMonth = moment('2023-10'); // Starting from October 2023
    const currentMonth = moment(); // Current month

    let current = startMonth.clone();

    while (current.isSameOrBefore(currentMonth)) {
      monthsList.push(current.format('MMMM-YYYY'));
      current.add(1, 'month');
    }

    return monthsList;
  };

  const listOfMonths = generateMonthsList();

  res.json(listOfMonths);
});


  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });


   

