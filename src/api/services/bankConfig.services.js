
const IswBankConfig = require('../model/iswBankConfigModel');

class BankConfigService{
    async createSingleDocument(data){
        return IswBankConfig.create(data);
    }

    async createMultipleDocument(array){
        return IswBankConfig.create(array);
    }

    async updateSingleDocument(filter, updateItem){
        return IswBankConfig.updateOne(filter, updateItem);
    }

    async updateMultipleDocument(filter, updateTodo){
        return IswBankConfig.updateMany(filter, updateTodo);
    }

    async deleteSingleDocument(){

    }

    async deleteManyDocument(){

    }

    async getSingleDocument(){

    }

    async getMultipleDocument(){

    }

}

module.exports = BankConfigService;