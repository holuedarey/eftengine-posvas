class AuthProcessors {

    static async isValidAuthPayload(data) {
        let userData = data;
        let errors = [];
        if(!userData.username) {
            errors.push('Username is required');
        }
        if(!userData.password) {
            errors.push('Password is required')
        }
        if(errors.length > 0){
            return {
                isValid: false,
                errors
            };
        }
        return { isValid: true };
    }

    


}

module.exports = AuthProcessors;