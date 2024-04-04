from pennsieve2 import Pennsieve
import re
import math



class UploadManifestSession:

    # properties 
    df_mid = None
    mdf_mid = None
    mff_mid = None
    ps = None

    # upload values 
    main_total_generate_dataset_size = None
    total_bytes_uploaded = {"value": 0} 
    bytes_uploaded_per_file = None # if the agent stops this needs to be stored in order to get an accurate accounting of what we had vs how much is now uplaoded for each file 
    total_files_uploaded = None
    total_files_to_upload = None 
    completed_files_byte_count = {"value": 0}

    def __init__(self):
        self.df_mid = None
        self.mdf_mid = None
        self.mff_mid = None

    def set_df_mid(self, id):
        self.df_mid = id

    def set_mdf_mid(self, id):
        self.mdf_mid = id
    
    def set_mff_mid(self, id):
        self.mff_mid = id
    
    def get_df_mid(self):
        return self.df_mid
    
    def get_mdf_mid(self):
        return self.mdf_mid
    
    def get_mff_mid(self):
        return self.mff_mid
    
    def set_bytes_uploaded_per_file(self, size):
        self.bytes_uploaded_per_file = size

    def get_bytes_uploaded_per_file(self):
        return self.bytes_uploaded_per_file
    
    def set_main_total_generate_dataset_size(self, size):
        self.main_total_generate_dataset_size = size

    def get_main_total_generate_dataset_size(self):
        return self.main_total_generate_dataset_size
    
    def set_total_uploaded_bytes(self, size):
        self.total_bytes_uploaded["value"] = size

    def get_total_uploaded_bytes(self):
        return self.total_bytes_uploaded["value"]
    
    def set_total_files_uploaded(self, count):
        self.total_files_uploaded = count

    def get_total_files_uploaded(self):
        return self.total_files_uploaded
    
    def set_total_files_to_upload(self, count):
        self.total_files_to_upload = count

    def get_total_files_to_upload(self):
        return self.total_files_to_upload

    def has_stored_mids(self):
        return self.df_mid is not None or self.mdf_mid is not None or self.mff_mid is not None
    
    def df_mid_has_progress(self):
        return self.manifest_has_progress(self.df_mid)
    
    def mdf_mid_has_progress(self):
        return self.manifest_has_progress(self.mdf_mid)
    
    def mff_mid_has_progress(self):
        return self.manifest_has_progress(self.mff_mid)
    
    def set_completed_files_byte_count(self, count):
        self.completed_files_byte_count["value"] = count

    def get_completed_files_byte_count(self):
        return self.completed_files_byte_count["value"]
    
    def manifest_has_progress(self, mid):
        if self.ps is None:
            self.ps = Pennsieve()
        mfs = self.ps.list_manifests()
        for mf in mfs:
            print(mf)
            if mf.id == mid and mf.status == "Initiated":
                return True      
        return False
    
    def get_remaining_df_file_count(self):
        return self.get_remaining_file_count(self.df_mid)
    
    def get_remaining_mdf_file_count(self):
        return self.get_remaining_file_count(self.mdf_mid)
    
    def get_remaining_mff_file_count(self):
        return self.get_remaining_file_count(self.mff_mid)
    
    def get_remaining_file_count(self, mid, total_files):
        if self.ps is None:
            self.ps = Pennsieve()
        total_pages = math.ceil(total_files / 1000)
        remaining_files = 0
        offset = 0
        for i in range(total_pages):
            if i > 1:
                offset += 1001
            file_page = self.ps.manifest.list_files(mid, offset , 1000)
            # if there is no node_id then an upload hasn't started yet - all files are remaining 
            # TODO: Add logic for getting the file count from the json object rather than the manifest string
            # regular expression that searches and counts for every string that has "status: LOCAL" or "status: REGISTERED" in the string
            remaining_files +=  len(re.findall(r'status: LOCAL|status: REGISTERED' , str(file_page)))
    
    def create_obj_from_string(self,s):
        # Split into individual objects
        objects = re.findall(r'file {([^}]*?)}', s, re.DOTALL)

        # Parse each object
        parsed_objects = []
        for obj in objects:
            # Split into lines and remove empty lines
            lines = [line.strip() for line in obj.split('\n') if line.strip()]
            # Split each line into key and value and create a dictionary
            parsed_object = {line.split(': ')[0]: line.split(': ')[1] for line in lines}
            parsed_objects.append(parsed_object)

        return parsed_objects

    def calculate_completed_upload_size(self, mid, bytes_per_file_dict, total_files):
        if self.ps is None:
            self.ps = Pennsieve()
        total_pages = math.ceil(total_files / 1000)
        offset = 0
        for i in range(total_pages):
            if i > 1:
                offset += 1001
            file_string = self.ps.manifest.list_files(mid, offset , 1000)
            parsed_objects = self.create_obj_from_string(str(file_string))
            total_bytes_uploaded = 0 
            for obj in parsed_objects:
                if obj['status'] == 'UPLOADED' or obj['status'] == 'IMPORTED' or obj['status'] == 'FINALIZED' or obj['status'] == 'VERIFIED':
                    file_path = obj['source_path']
                    # remove the first and last characer of file_path - these are quotation marks
                    file_path = file_path[1:-1]
                    total_bytes_uploaded += int(bytes_per_file_dict.get(file_path, 0))

        return total_bytes_uploaded




    




