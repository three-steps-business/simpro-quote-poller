'use strict';

const _ = require('lodash')
const request = require("request");
const moment = require('moment')

const simproUrl = process.env.SIMPRO_URL;
const simproApiKey = process.env.SIMPRO_API_KEY;
const integromatHook = process.env.INTEGROMAT_HOOK;

// For Local development testing
// const simproUrl = 'https://aptplumbing.simprosuite.com';
// const simproApiKey = '4d77a9138a51b7414707e0ba8bd5adb4318c3642';
// const integromatHook = 'https://hook.integromat.com/vrr2f1g4tmj6uktlcr9f4ux9ou7v3m5y'
// getQuotes();

exports.handler = (event, context, callback) => {
    getQuotes()
};

function getQuotes () {
  var options = {
    method: 'GET',
    url: simproUrl + '/api/v1.0/companies/0/quotes/?columns=ID,DateModified',
    headers:
    {
      Authorization: 'Bearer ' + simproApiKey,
      'Content-Type': 'application/json',
      'accept': 'application/json'
    }
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    var quotes = JSON.parse(body);
    var newQuotes = _.filter(quotes, function(q) {
      var now = moment().format('YYYY-MM-DD');
      var quoteModifiedDate = moment(q.DateModified).format('YYYY-MM-DD')
      // console.log(now)
      // console.log(quoteModifiedDate)
      // console.log(quoteModifiedDate == now)
      return quoteModifiedDate == now
    });
    console.log('New Quotes', newQuotes);

    newQuotes.forEach(function(quote) {
      getQuote(quote.ID)
    });
  });
}

function getQuote (id) {
  var request = require("request");

  var options = {
    method: 'GET',
    url: simproUrl + '/api/v1.0/companies/0/quotes/' + id + '?columns=ID,Customer,CustomerContact,Salesperson,Technician,DateIssued,Stage,Status,Total',
    headers:
    {
      Authorization: 'Bearer ' + simproApiKey,
      'Content-Type': 'application/json',
      'accept': 'application/json'
    }
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    var quote = JSON.parse(body);
    getQuoteSchedule(quote)
  });
}

function getQuoteSchedule (quote) {
  var request = require("request");

  var options = {
    method: 'GET',
    url: simproUrl + '/api/v1.0/companies/0/quotes/' + quote.ID + '/timelines/',
    headers:
    {
      Authorization: 'Bearer ' + simproApiKey,
      'Content-Type': 'application/json',
      'accept': 'application/json'
    }
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    var timelineArr = JSON.parse(body);
    var schedules = _.filter(timelineArr, function(o) {
       return o.Type == 'Schedule';
    });
    if (!schedules === undefined || !schedules.length == 0) quote.Schedule = schedules[0].Date
    getCustomer(quote.Customer.ID, quote)
  });

}

function getCustomer (id, quote) {
  var request = require("request");

  var options = {
    method: 'GET',
    url:  simproUrl + '/api/v1.0/companies/0/customers/companies/' + id + '?columns=ID,Email,CompanyName,Tags,Phone,Profile',
    headers:
    {
      Authorization: 'Bearer ' + simproApiKey,
      'Content-Type': 'application/json',
      'accept': 'application/json'
    }
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    var customer = JSON.parse(body);

    if(customer.errors) {
      getCustomerIndividual(id, quote)
    } else {
      if(customer.Email) {
        if(validEmail(customer.Email)) {
          getCustomerMainContact(customer, quote)
        } else {
          console.log('-- Customer has an invalid email address --')
        }
      } else {
        console.log('-- Customer has no email address --')
      }
    }
  });
}

function getCustomerMainContact (customer, quote) {
  var request = require("request");
  var mainContacts = []

  var options = {
    method: 'GET',
    url:  simproUrl + '/api/v1.0/companies/0/customers/' + customer.ID + '/contacts/',
    headers:
    {
      Authorization: 'Bearer ' + simproApiKey,
      'Content-Type': 'application/json',
      'accept': 'application/json'
    }
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error)

    var mainContacts = JSON.parse(body)
    var mainContact = mainContacts[0]

    if(mainContact) { //check if has contacts? - yes? save first contact as first and last name, orgname as company name, and email as company EMAIL
      // loop thru all customer contacts to check which is the main quote contact
      mainContacts.forEach(function(contact) {
        getCustomerQuoteContact(contact, customer, quote)
      });
    } else { // - no? save contact as company firstname and last name, orgname as copmpany name, email as company email
      customer.GivenName = customer.CompanyName
      customer.CellPhone = customer.Phone
      // console.log(customer, quote)
      postContact(customer, quote)
    }
  });
}

function getCustomerQuoteContact (contact, customer, quote) {
  var request = require("request");

  var options = {
    method: 'GET',
    url: simproUrl + '/api/v1.0/companies/0/customers/' + customer.ID + '/contacts/' + contact.ID,
    headers:
    {
      Authorization: 'Bearer ' + simproApiKey,
      'Content-Type': 'application/json',
      'accept': 'application/json'
    }
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    var contact = JSON.parse(body);

    if(contact.PrimaryQuoteContact) { //check if contact is Primary Quote Contact - yes? save first contact as first and last name, orgname as company name, and email as company EMAIL
      customer.GivenName = contact.GivenName
      customer.FamilyName = contact.FamilyName
      if(contact.Email) customer.Email = contact.Email
      customer.CellPhone = contact.CellPhone
      customer.PrimaryQuoteContact = contact.PrimaryQuoteContact
      // console.log(customer, quote)
      postContact(customer, quote)
    } else { // - no? save contact as company firstname and last name, orgname as copmpany name, email as company email
      console.log('-- Contact is not a Primary Quote Contact --')
    }
  });
}

function getCustomerIndividual (id, quote) {
  var request = require("request");

  var options = {
    method: 'GET',
    url: simproUrl + '/api/v1.0/companies/0/customers/individuals/' + id + '?columns=Email,GivenName,FamilyName,Tags,CellPhone,Profile',
    headers:
    {
      Authorization: 'Bearer ' + simproApiKey,
      'Content-Type': 'application/json',
      'accept': 'application/json'
    }
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    var customerIndividual = JSON.parse(body);

    if(customerIndividual.Email) {
      if(validEmail(customerIndividual.Email)) {
        // console.log(customer, quote)
        postContact(customerIndividual, quote)
      } else {
        console.log('-- Customer has an invalid email address --')
      }
    } else {
      console.log('-- Customer has no email address --')
    }
  });
}

function postContact (customer, quote) {
  var reqBody = {...customer, ...quote}
  var request = require("request");
  console.log(reqBody);
  var options = {
    method: 'POST',
    url: integromatHook,
    json: true,   // <--Very important!!!
    body: reqBody,
    headers:
    {
      'Content-Type': 'application/json',
      'accept': 'application/json'
    }
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    console.log(body)
  });
}

function validEmail (email) {
  var regex = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/g;
  return regex.test(email)
}
