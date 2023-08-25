import boto3
import requests
from os.path import expanduser, join, exists
from configparser import ConfigParser
from flask import abort
from os import mkdir
import time

from namespaces import NamespaceEnum, get_namespace_logger
namespace_logger = get_namespace_logger(NamespaceEnum.USER)

userpath = expanduser("~")
configpath = join(userpath, ".pennsieve", "config.ini")
PENNSIEVE_URL = "https://api.pennsieve.io"

# Variables for token caching
cached_access_token = None
last_fetch_time = 0
TOKEN_CACHE_DURATION = 60 # Amount of time in seconds to cache the access token

def get_access_token():
    """
        Creates a temporary access token for utilizing the Pennsieve API. Reads the api token and secret from the Pennsieve config.ini file.
        get cognito config 
    """
    global cached_access_token, last_fetch_time, TOKEN_CACHE_DURATION # Variables used for token caching
    global namespace_logger
    current_time = time.time()

    # If the cached_access_token is not None and the last fetch time is less than the cache duration, return the cached access token
    if cached_access_token and current_time - last_fetch_time < TOKEN_CACHE_DURATION:
        return cached_access_token
    
    r = requests.get(f"{PENNSIEVE_URL}/authentication/cognito-config")
    r.raise_for_status()


    cognito_app_client_id = r.json()["tokenPool"]["appClientId"]
    cognito_region_name = r.json()["region"]

    cognito_idp_client = boto3.client(
        "cognito-idp",
        region_name=cognito_region_name,
        aws_access_key_id="",
        aws_secret_access_key="",
    )


    login_response = cognito_idp_client.initiate_auth(
        AuthFlow="USER_PASSWORD_AUTH",
        AuthParameters={"USERNAME": get_profile_name_from_api_key("api_token"), "PASSWORD": get_profile_name_from_api_key("api_secret")},
        ClientId=cognito_app_client_id,
    )

    cached_access_token = login_response["AuthenticationResult"]["AccessToken"]
    last_fetch_time = current_time

    return cached_access_token
        

def clear_cached_access_token():
    global cached_access_token
    cached_access_token = None



def get_cognito_userpool_access_token(email, password):
    """
    Creates a temporary access token for utilizing the Pennsieve API. Utilizes email and password to authenticate with the Pennsieve Cognito Userpool 
    which provides higher privileges than the API token and secret flow.
    """
    PENNSIEVE_URL = "https://api.pennsieve.io"

    try:
        response = requests.get(f"{PENNSIEVE_URL}/authentication/cognito-config")
        response.raise_for_status()
        cognito_app_client_id = response.json()["userPool"]["appClientId"]
        cognito_region = response.json()["userPool"]["region"]
        cognito_client = boto3.client(
            "cognito-idp",
            region_name=cognito_region,
            aws_access_key_id="",
            aws_secret_access_key="",
        )
    except Exception as e:
        raise Exception(e) from e

    try:
        login_response = cognito_client.initiate_auth(
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": email, "PASSWORD": password},
            ClientId=cognito_app_client_id,
        )
    except Exception as e:
        abort(400, "Username or password was incorrect.")

    try:
        access_token = login_response["AuthenticationResult"]["AccessToken"]
        response = requests.get(
            f"{PENNSIEVE_URL}/user", headers={"Authorization": f"Bearer {access_token}"}
        )
        response.raise_for_status()
    except Exception as e:
        raise e

    return access_token

def get_profile_name_from_api_key(key):
    config = ConfigParser()
    config.read(configpath)
    if "global" not in config:
        raise Exception("Profile has not been set")

    keyname = config["global"]["default_profile"]

    if keyname in config and key in config[keyname]:
        return config[keyname][key]
    return None


def bf_delete_account(keyname):
    """
    Args:
        keyname: name of local Pennsieve account key (string)
    Action:
        Deletes account information from the Pennsieve config file
    """
    config = ConfigParser()
    config.read(configpath)
    config.remove_section(keyname)
    with open(configpath, "w") as configfile:
        config.write(configfile)

    

def bf_delete_default_profile():
    config = ConfigParser()
    config.read(configpath)

    if "global" not in config:
        return 
    
    default_profile_name = config["global"]["default_profile"]
    config.remove_section("global")

    with open(configpath, "w") as configfile:
        config.write(configfile)


def create_unique_profile_name(token, email, account_name):
    try:
        # get the users email
        PENNSIEVE_URL = "https://api.pennsieve.io"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }


        r = requests.get(f"{PENNSIEVE_URL}/user", headers=headers)    
        r.raise_for_status()    

        user_info = r.json()

        # create a substring of the start of the email to the @ symbol
        email_sub = email.split("@")[0]

        organization_id = user_info["preferredOrganization"]

        # get the organizations this user account has access to 
        r = requests.get(f"{PENNSIEVE_URL}/organizations", headers=headers)
        r.raise_for_status()

        organizations = r.json()

        organization = None
        for org in organizations["organizations"]:
            if org["organization"]["id"] == organization_id:
                organization = org["organization"]["name"]

        # create an updated profile name that is unqiue to the user and their workspace 
        return f"{account_name}-{email_sub}-{organization}"
    except Exception as e:
        raise e


def bf_add_account_username(keyname, key, secret):
    """
    Associated with 'Add account' button in 'Login to your Pennsieve account' section of SODA

    Args:
        keyname: Name of the account to be associated with the given credentials (string)
        key: API key (string)
        secret: API Secret (string)
    Action:
        Adds account to the Pennsieve configuration file (local machine)
    """
    global namespace_logger

    temp_keyname = "SODA_temp_generated"
    # first delete the pre-existing default_profile entry , but not the profile itself 

    # lowercase the key name 
    keyname = keyname.lower()
    
    bf_delete_default_profile()
    try:
        keyname = keyname.strip()

        bfpath = join(userpath, ".pennsieve")
        # Load existing or create new config file
        config = ConfigParser()
        if exists(configpath):
            config.read(configpath)
        elif not exists(bfpath):
            mkdir(bfpath)

        # Add agent section
        agentkey = "agent"
        if not config.has_section(agentkey):
            config.add_section(agentkey)
            config.set(agentkey, "port", "9000")
            config.set(agentkey, "upload_workers", "10")
            config.set(agentkey, "upload_chunk_size", "32")


        # ensure that if the profile already exists it has an api_host entry 
        # if config.has_section(keyname):
        #     config.set(keyname, "api_host", PENNSIEVE_URL)

        # Add new account if it does not already exist
        if not config.has_section(keyname):
            config.add_section(keyname)

        config.set(keyname, "api_token", key)
        config.set(keyname, "api_secret", secret)
        # config.set(keyname, "api_host", PENNSIEVE_URL)

        # set profile name in global section
        if not config.has_section("global"):
            config.add_section("global")
            config.set("global", "default_profile", keyname)

        
        with open(configpath, "w") as configfile:
            config.write(configfile)

    except Exception as e:
        raise e

    # Check key and secret are valid, if not delete account from config
    try:
        token = get_access_token()
    except Exception as e:
        namespace_logger.error(e)
        bf_delete_account(keyname)
        abort(401, 
            "Please check that key name, key, and secret are entered properly"
        )

    try:
        if not config.has_section("global"):
            config.add_section("global")

        default_acc = config["global"]
        default_acc["default_profile"] = keyname

        with open(configpath, "w+") as configfile:
            config.write(configfile)

        return {"message": f"Successfully added account {keyname}"}

    except Exception as e:
        bf_delete_account(keyname)
        raise e


def delete_duplicate_keys(token, keyname):
    try:
        PENNSIEVE_URL = "https://api.pennsieve.io"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }

        r = requests.get(f"{PENNSIEVE_URL}/token", headers=headers)
        r.raise_for_status()

        tokens = r.json()

        for token in tokens:
            if token["name"] == keyname:
                r = requests.delete(f"{PENNSIEVE_URL}/token/{token['key']}", headers=headers)
                r.raise_for_status()
    except Exception as e:
        raise e


def get_pennsieve_api_key_secret(email, password, keyname):

    api_key = get_cognito_userpool_access_token(email, password)
    
    try:
        delete_duplicate_keys(api_key, keyname)

        url = "https://api.pennsieve.io/token/"

        payload = {"name": f"{keyname}"}
        headers = {
            "Accept": "*/*",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        response = requests.request("POST", url, json=payload, headers=headers)
        response.raise_for_status()
        response = response.json()

        profile_name = create_unique_profile_name(api_key, email, keyname)

        clear_cached_access_token()

        return { 
            "success": "success", 
            "key": response["key"], 
            "secret": response["secret"], 
            "name": profile_name
        }
    except Exception as e:
        raise e
