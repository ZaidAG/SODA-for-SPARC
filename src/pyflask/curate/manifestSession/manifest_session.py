from pennsieve2 import Pennsieve
import re



class UploadManifestSession:

    # properties 
    df_mid = None
    mdf_mid = None
    mff_mid = None
    ps = None

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
    
    def has_stored_mids(self):
        return self.df_mid is not None or self.mdf_mid is not None or self.mff_mid is not None
    
    def df_mid_has_progress(self):
        return self.manifest_has_progress(self.df_mid)
    
    def mdf_mid_has_progress(self):
        return self.manifest_has_progress(self.mdf_mid)
    
    def mff_mid_has_progress(self):
        return self.manifest_has_progress(self.mff_mid)
    
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
    
    def get_remaining_file_count(self, mid):
        file_string = self.ps.manifest.list_files(mid)
        print(str(file_string))

        # if there is no node_id then an upload hasn't started yet - all files are remaining 
        # TODO: Add logic for getting the file count from the json object rather than the manifest string

        # regular expression that searches and counts for every string that has "status: LOCAL" or "status: REGISTERED" in the string
        return len(re.findall(r'status: LOCAL | status: REGISTERED' , str(file_string)))